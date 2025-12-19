import type { Board, Post, PostSummary } from "../domain";
import type { ScreenModel } from "../protocol";
import type { BbsDb } from "../db";

type TerminalContext = {
  user: string;
  rows: number;
  cols: number;
  postsPageSize: number;
};

type ModeBoards = { kind: "boards"; boards: Board[] };
type ModePosts = { kind: "posts"; board: Board; page: number; posts: PostSummary[] };
type ModePost = { kind: "post"; board: Board; postsReturnPage: number; post: Post; page: number };
type ModeWriteTitle = { kind: "writeTitle"; board: Board; postsReturnPage: number };
type ModeWriteBody = { kind: "writeBody"; board: Board; postsReturnPage: number; title: string; lines: string[] };

type Mode = ModeBoards | ModePosts | ModePost | ModeWriteTitle | ModeWriteBody;

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeTerminalContext(input: Partial<TerminalContext>): TerminalContext {
  const user = typeof input.user === "string" && input.user.trim().length > 0 ? input.user.trim() : "anonymous";
  const rows = typeof input.rows === "number" && Number.isFinite(input.rows) ? clampInt(input.rows, 10, 200) : 24;
  const cols = typeof input.cols === "number" && Number.isFinite(input.cols) ? clampInt(input.cols, 20, 240) : 80;
  const postsPageSize =
    typeof input.postsPageSize === "number" && Number.isFinite(input.postsPageSize)
      ? clampInt(input.postsPageSize, 1, 50)
      : 10;

  return { user, rows, cols, postsPageSize };
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.replace("T", " ").replace("Z", "");
}

function sanitizePlainText(value: string): string {
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x1b]/g, "");
}

function wrapLine(line: string, width: number): string[] {
  if (width <= 0) return [line];
  if (line.length <= width) return [line];

  const parts: string[] = [];
  let rest = line;
  while (rest.length > width) {
    parts.push(rest.slice(0, width));
    rest = rest.slice(width);
  }
  parts.push(rest);
  return parts;
}

function wrapText(text: string, width: number): string[] {
  const safeText = sanitizePlainText(text).replace(/\r\n/g, "\n");
  const lines = safeText.split("\n");
  return lines.flatMap((line) => wrapLine(line, width));
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages.length ? pages : [[]];
}

export class BbsUiSession {
  private ctx: TerminalContext = normalizeTerminalContext({});
  private mode: Mode = { kind: "boards", boards: [] };
  private toast: string | undefined;

  constructor(private readonly db: BbsDb) {}

  handleHello(payload: { user: string; rows?: number; cols?: number; pageSize?: number }): ScreenModel {
    this.ctx = normalizeTerminalContext({
      user: payload.user,
      rows: payload.rows,
      cols: payload.cols,
      postsPageSize: payload.pageSize,
    });

    const boards = this.db.listBoards();
    this.mode = { kind: "boards", boards };
    return this.render();
  }

  handleEvent(inputRaw: string): ScreenModel {
    const inputTrimmed = inputRaw.trim();

    if (this.mode.kind === "boards") {
      if (inputTrimmed === "0") {
        return this.screen({
          title: "Bye",
          lines: ["Session ended."],
          prompt: "",
          inputMode: "line",
          actions: [{ type: "exit" }],
        });
      }

      const selected = Number(inputTrimmed);
      if (!Number.isFinite(selected) || selected < 1 || selected > this.mode.boards.length) {
        this.toast = "Select a board number.";
        return this.render();
      }

      const board = this.mode.boards[selected - 1]!;
      const page = 1;
      const posts = this.db.listPosts(board.id, page, this.ctx.postsPageSize);
      this.mode = { kind: "posts", board, page, posts };
      return this.render();
    }

    if (this.mode.kind === "posts") {
      const cmd = inputTrimmed.toUpperCase();

      if (cmd === "0") {
        const boards = this.db.listBoards();
        this.mode = { kind: "boards", boards };
        return this.render();
      }

      if (cmd === "N") {
        const nextPage = this.mode.page + 1;
        const posts = this.db.listPosts(this.mode.board.id, nextPage, this.ctx.postsPageSize);
        if (posts.length === 0) {
          this.toast = "No more posts.";
          return this.render();
        }
        this.mode = { ...this.mode, page: nextPage, posts };
        return this.render();
      }

      if (cmd === "P") {
        if (this.mode.page <= 1) {
          this.toast = "Already at first page.";
          return this.render();
        }
        const prevPage = this.mode.page - 1;
        const posts = this.db.listPosts(this.mode.board.id, prevPage, this.ctx.postsPageSize);
        this.mode = { ...this.mode, page: prevPage, posts };
        return this.render();
      }

      if (cmd === "W") {
        this.mode = { kind: "writeTitle", board: this.mode.board, postsReturnPage: this.mode.page };
        return this.render();
      }

      const readMatch = /^R(?:\s+(\d+))?$/i.exec(inputTrimmed);
      if (readMatch) {
        const postId = readMatch[1] ? Number(readMatch[1]) : NaN;
        if (!Number.isFinite(postId) || postId < 1) {
          this.toast = "Usage: R <postId>";
          return this.render();
        }

        const post = this.db.getPost(postId);
        if (!post || post.boardId !== this.mode.board.id) {
          this.toast = `Post not found: ${postId}`;
          return this.render();
        }

        this.mode = { kind: "post", board: this.mode.board, postsReturnPage: this.mode.page, post, page: 1 };
        return this.render();
      }

      this.toast = "Commands: N, P, R <id>, W, 0";
      return this.render();
    }

    if (this.mode.kind === "post") {
      const cmd = inputTrimmed.toUpperCase();

      if (cmd === "0") {
        const posts = this.db.listPosts(this.mode.board.id, this.mode.postsReturnPage, this.ctx.postsPageSize);
        this.mode = { kind: "posts", board: this.mode.board, page: this.mode.postsReturnPage, posts };
        return this.render();
      }

      if (cmd === "N") {
        this.mode = { ...this.mode, page: this.mode.page + 1 };
        return this.render();
      }

      if (cmd === "P") {
        this.mode = { ...this.mode, page: Math.max(1, this.mode.page - 1) };
        return this.render();
      }

      this.toast = "Commands: N, P, 0";
      return this.render();
    }

    if (this.mode.kind === "writeTitle") {
      if (inputTrimmed === "0") {
        const posts = this.db.listPosts(this.mode.board.id, this.mode.postsReturnPage, this.ctx.postsPageSize);
        this.mode = { kind: "posts", board: this.mode.board, page: this.mode.postsReturnPage, posts };
        return this.render();
      }

      const title = inputTrimmed;
      if (title.length === 0) {
        this.toast = "Title cannot be empty.";
        return this.render();
      }

      this.mode = { kind: "writeBody", board: this.mode.board, postsReturnPage: this.mode.postsReturnPage, title, lines: [] };
      return this.render();
    }

    if (this.mode.kind === "writeBody") {
      if (inputTrimmed === "0") {
        const posts = this.db.listPosts(this.mode.board.id, this.mode.postsReturnPage, this.ctx.postsPageSize);
        this.mode = { kind: "posts", board: this.mode.board, page: this.mode.postsReturnPage, posts };
        return this.render();
      }

      if (inputTrimmed === ".") {
        const body = this.mode.lines.join("\n").trimEnd();
        if (body.trim().length === 0) {
          this.toast = "Body cannot be empty.";
          return this.render();
        }

        const postId = this.db.createPost({
          boardId: this.mode.board.id,
          title: this.mode.title,
          body,
          author: this.ctx.user,
        });

        const page = 1;
        const posts = this.db.listPosts(this.mode.board.id, page, this.ctx.postsPageSize);
        this.mode = { kind: "posts", board: this.mode.board, page, posts };
        this.toast = `Posted #${postId}`;
        return this.render();
      }

      this.mode.lines.push(inputRaw);
      return this.render();
    }

    return this.render();
  }

  private takeToast(): string | undefined {
    const toast = this.toast;
    this.toast = undefined;
    return toast;
  }

  private screen(screen: Omit<ScreenModel, "toast">): ScreenModel {
    const toast = this.takeToast();
    return toast ? { ...screen, toast } : screen;
  }

  render(): ScreenModel {
    switch (this.mode.kind) {
      case "boards":
        return this.renderBoards(this.mode);
      case "posts":
        return this.renderPosts(this.mode);
      case "post":
        return this.renderPost(this.mode);
      case "writeTitle":
        return this.renderWriteTitle(this.mode);
      case "writeBody":
        return this.renderWriteBody(this.mode);
    }
  }

  private renderBoards(mode: ModeBoards): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push("Select a board:");
    lines.push("");

    for (let i = 0; i < mode.boards.length; i++) {
      lines.push(`${i + 1}) ${sanitizePlainText(mode.boards[i]!.name)}`);
    }
    lines.push("0) Exit");

    return this.screen({
      title: "test-bbs (Main Menu)",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderPosts(mode: ModePosts): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Board: ${sanitizePlainText(mode.board.name)}] Page ${mode.page}`);
    lines.push("");

    if (mode.posts.length === 0) {
      lines.push("(no posts)");
    } else {
      for (const post of mode.posts) {
        lines.push(
          `${post.id}\t${sanitizePlainText(post.title)}\t(${sanitizePlainText(post.author)}, ${formatDate(post.createdAt)})`,
        );
      }
    }

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
      hints: ["Commands: N=Next  P=Prev  R <id>=Read  W=Write  0=Back"],
    });
  }

  private renderPost(mode: ModePost): ScreenModel {
    const rows = this.ctx.rows;
    const cols = this.ctx.cols;

    const overhead = 9;
    const bodyHeight = Math.max(rows - overhead, 5);
    const wrappedBody = wrapText(mode.post.body, cols);
    const pages = chunk(wrappedBody, bodyHeight);
    const totalPages = pages.length;

    let page = mode.page;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    if (page !== mode.page) {
      this.mode = { ...mode, page };
      this.toast = "End of post.";
    }

    const pageIndex = Math.max(0, page - 1);

    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Board: ${sanitizePlainText(mode.board.name)}] Post #${mode.post.id} (${page}/${totalPages})`);
    lines.push(`Title: ${sanitizePlainText(mode.post.title)}`);
    lines.push(`Author: ${sanitizePlainText(mode.post.author)}`);
    lines.push(`Date: ${formatDate(mode.post.createdAt)}`);
    lines.push("-".repeat(Math.min(cols, 80)));
    for (const line of pages[pageIndex] ?? []) lines.push(line);
    lines.push("-".repeat(Math.min(cols, 80)));

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
      hints: ["Commands: N=Next page  P=Prev page  0=Back"],
    });
  }

  private renderWriteTitle(mode: ModeWriteTitle): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Board: ${sanitizePlainText(mode.board.name)}] Write Post`);
    lines.push("");
    lines.push("Enter title (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderWriteBody(mode: ModeWriteBody): ScreenModel {
    const rows = this.ctx.rows;
    const cols = this.ctx.cols;

    const overhead = 10;
    const previewHeight = Math.max(rows - overhead, 5);

    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Board: ${sanitizePlainText(mode.board.name)}] Write Post`);
    lines.push(`Title: ${sanitizePlainText(mode.title)}`);
    lines.push("");
    lines.push("Enter body. '.' on its own line to finish. '0' to cancel.");
    lines.push("-".repeat(Math.min(cols, 80)));

    const preview = mode.lines.slice(-previewHeight);
    for (const line of preview) {
      for (const wrapped of wrapLine(sanitizePlainText(line), cols)) lines.push(wrapped);
    }

    lines.push("-".repeat(Math.min(cols, 80)));

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "multiline",
    });
  }
}
