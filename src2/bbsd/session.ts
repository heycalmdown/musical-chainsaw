import type { ScreenModel } from "../protocol";
import type { BbsService } from "./service";

type TermSize = { rows: number; cols: number };
type UiContext = { user: string; term: TermSize };

type State =
  | { kind: "boards" }
  | { kind: "posts"; boardId: number; page: number }
  | { kind: "post"; boardId: number; postId: number; page: number; returnTo: { boardId: number; page: number } }
  | { kind: "writeTitle"; boardId: number; returnTo: { boardId: number; page: number } }
  | { kind: "writeBody"; boardId: number; title: string; lines: string[]; returnTo: { boardId: number; page: number } }
  | { kind: "exit" };

function normalizeTermSize(rows: unknown, cols: unknown): TermSize {
  const defaultRows = 24;
  const defaultCols = 80;

  const r = typeof rows === "number" && Number.isFinite(rows) ? Math.trunc(rows) : defaultRows;
  const c = typeof cols === "number" && Number.isFinite(cols) ? Math.trunc(cols) : defaultCols;

  return {
    rows: Math.max(10, Math.min(200, r)),
    cols: Math.max(20, Math.min(300, c)),
  };
}

function formatDate(createdAt: string): string {
  if (!createdAt) return "";
  return createdAt.length >= 16 ? createdAt.slice(0, 16) : createdAt;
}

function wrapLine(line: string, cols: number): string[] {
  if (cols <= 0) return [line];
  if (line.length === 0) return [""];

  const out: string[] = [];
  for (let i = 0; i < line.length; i += cols) out.push(line.slice(i, i + cols));
  return out;
}

function wrapText(text: string, cols: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const rawLines = normalized.split("\n");
  const out: string[] = [];
  for (const line of rawLines) out.push(...wrapLine(line, cols));
  return out;
}

function clampPage(page: number, totalPages: number): number {
  if (totalPages <= 0) return 1;
  return Math.max(1, Math.min(totalPages, page));
}

export class Session {
  private ctx: UiContext;
  private state: State = { kind: "boards" };
  private toast: string | undefined;

  constructor(private readonly service: BbsService) {
    this.ctx = { user: "unknown", term: { rows: 24, cols: 80 } };
  }

  setHello(user: unknown, rows: unknown, cols: unknown): ScreenModel {
    this.ctx.user = typeof user === "string" && user.trim() ? user.trim() : "unknown";
    this.ctx.term = normalizeTermSize(rows, cols);
    this.state = { kind: "boards" };
    this.toast = undefined;
    return this.render();
  }

  handleEvent(input: unknown, rows: unknown, cols: unknown): ScreenModel {
    this.ctx.term = normalizeTermSize(rows, cols);
    const line = typeof input === "string" ? input : "";
    this.reduce(line);
    return this.render();
  }

  private setToast(message: string): void {
    this.toast = message;
  }

  private consumeToast(): string | undefined {
    const t = this.toast;
    this.toast = undefined;
    return t;
  }

  private reduce(inputRaw: string): void {
    const input = inputRaw.trim();

    switch (this.state.kind) {
      case "boards": {
        if (input === "0") {
          this.state = { kind: "exit" };
          return;
        }
        const boardId = Number.parseInt(input, 10);
        if (!Number.isFinite(boardId)) {
          this.setToast("번호를 입력하세요.");
          return;
        }
        const board = this.service.getBoard(boardId);
        if (!board) {
          this.setToast("존재하지 않는 보드입니다.");
          return;
        }
        this.state = { kind: "posts", boardId, page: 1 };
        return;
      }

      case "posts": {
        const { boardId, page } = this.state;
        const upper = input.toUpperCase();

        if (upper === "0") {
          this.state = { kind: "boards" };
          return;
        }

        if (upper === "N") {
          this.state = { kind: "posts", boardId, page: page + 1 };
          return;
        }
        if (upper === "P") {
          this.state = { kind: "posts", boardId, page: Math.max(1, page - 1) };
          return;
        }
        if (upper === "W") {
          this.state = { kind: "writeTitle", boardId, returnTo: { boardId, page } };
          return;
        }
        if (upper.startsWith("R")) {
          const match = /^R\s+(\d+)$/i.exec(input);
          if (!match) {
            this.setToast("형식: R <id>");
            return;
          }
          const postId = Number.parseInt(match[1] ?? "", 10);
          const post = this.service.getPost(postId);
          if (!post || post.board_id !== boardId) {
            this.setToast("해당 글을 찾을 수 없습니다.");
            return;
          }
          this.state = { kind: "post", boardId, postId, page: 1, returnTo: { boardId, page } };
          return;
        }

        this.setToast("명령을 확인하세요. (N/P/R/W/0)");
        return;
      }

      case "post": {
        const { boardId, postId, page, returnTo } = this.state;
        const upper = input.toUpperCase();

        if (upper === "0") {
          this.state = { kind: "posts", boardId: returnTo.boardId, page: returnTo.page };
          return;
        }

        const post = this.service.getPost(postId);
        if (!post || post.board_id !== boardId) {
          this.setToast("해당 글을 찾을 수 없습니다.");
          this.state = { kind: "posts", boardId: returnTo.boardId, page: returnTo.page };
          return;
        }

        const { totalPages } = this.paginatePostBody(post.body);

        if (upper === "N") {
          this.state = { kind: "post", boardId, postId, page: clampPage(page + 1, totalPages), returnTo };
          return;
        }
        if (upper === "P") {
          this.state = { kind: "post", boardId, postId, page: clampPage(page - 1, totalPages), returnTo };
          return;
        }

        this.setToast("명령을 확인하세요. (N/P/0)");
        return;
      }

      case "writeTitle": {
        const { boardId, returnTo } = this.state;
        if (input === "0") {
          this.state = { kind: "posts", boardId: returnTo.boardId, page: returnTo.page };
          return;
        }
        if (!input) {
          this.setToast("제목을 입력하세요. (0 취소)");
          return;
        }
        this.state = { kind: "writeBody", boardId, title: inputRaw.trimEnd(), lines: [], returnTo };
        return;
      }

      case "writeBody": {
        const { boardId, title, lines, returnTo } = this.state;

        if (input === "0") {
          this.state = { kind: "posts", boardId: returnTo.boardId, page: returnTo.page };
          this.setToast("작성 취소");
          return;
        }
        if (input === ".") {
          const body = lines.join("\n");
          const postId = this.service.createPost(boardId, title, body, this.ctx.user);
          this.state = { kind: "posts", boardId, page: 1 };
          this.setToast(`작성 완료: #${postId}`);
          return;
        }

        lines.push(inputRaw.replace(/\r?\n/g, ""));
        this.state = { kind: "writeBody", boardId, title, lines, returnTo };
        return;
      }

      case "exit":
        return;
    }
  }

  private render(): ScreenModel {
    const toast = this.consumeToast();
    switch (this.state.kind) {
      case "boards":
        return this.renderBoards(toast);
      case "posts":
        return this.renderPosts(this.state.boardId, this.state.page, toast);
      case "post":
        return this.renderPost(this.state, toast);
      case "writeTitle":
        return this.renderWriteTitle(this.state, toast);
      case "writeBody":
        return this.renderWriteBody(this.state, toast);
      case "exit":
        return {
          title: "Bye",
          lines: ["연결을 종료합니다."],
          prompt: "",
          inputMode: "line",
          actions: [{ type: "exit" }],
          toast,
        };
    }
  }

  private renderBoards(toast: string | undefined): ScreenModel {
    const boards = this.service.listBoards();
    const lines = [
      `사용자: ${this.ctx.user}`,
      "",
      ...boards.map((b) => `${b.id}) ${b.name}`),
      "",
      "0) 종료",
    ];

    return {
      title: "Main Menu",
      lines: this.fit(lines),
      prompt: "> ",
      inputMode: "line",
      hints: ["보드 번호 선택, 0 종료"],
      toast,
    };
  }

  private renderPosts(boardId: number, pageRaw: number, toast: string | undefined): ScreenModel {
    const board = this.service.getBoard(boardId);
    if (!board) {
      this.state = { kind: "boards" };
      return {
        title: "Main Menu",
        lines: ["보드를 찾을 수 없습니다."],
        prompt: "> ",
        inputMode: "line",
        hints: ["보드 번호 선택, 0 종료"],
        toast,
      };
    }

    const pageSize = Math.max(5, this.ctx.term.rows - 10);
    const { posts, total } = this.service.listPosts(boardId, pageRaw, pageSize);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = clampPage(pageRaw, totalPages);

    const { posts: pagePosts } = this.service.listPosts(boardId, page, pageSize);

    const header = [`Board: ${board.name}  (page ${page}/${totalPages})`, ""];
    const body =
      pagePosts.length === 0
        ? ["(게시글이 없습니다)"]
        : pagePosts.map((p) => `${p.id} | ${p.title} | ${p.author} | ${formatDate(p.created_at)}`);

    return {
      title: "Posts",
      lines: this.fit([...header, ...body]),
      prompt: "> ",
      inputMode: "line",
      hints: ["N 다음, P 이전, R <id> 읽기, W 쓰기, 0 뒤로"],
      toast,
    };
  }

  private paginatePostBody(body: string): { pages: string[][]; totalPages: number } {
    const wrapped = wrapText(body, this.ctx.term.cols);
    const perPage = Math.max(5, this.ctx.term.rows - 10);
    const pages: string[][] = [];
    for (let i = 0; i < wrapped.length; i += perPage) pages.push(wrapped.slice(i, i + perPage));
    if (pages.length === 0) pages.push(["(본문이 비어 있습니다)"]);
    return { pages, totalPages: pages.length };
  }

  private renderPost(state: Extract<State, { kind: "post" }>, toast: string | undefined): ScreenModel {
    const post = this.service.getPost(state.postId);
    if (!post) {
      this.state = { kind: "posts", boardId: state.returnTo.boardId, page: state.returnTo.page };
      return this.render();
    }

    const { pages, totalPages } = this.paginatePostBody(post.body);
    const page = clampPage(state.page, totalPages);
    const pageLines = pages[page - 1] ?? [];

    const lines = [
      `${post.id} | ${post.title}`,
      `by ${post.author} @ ${formatDate(post.created_at)}  (${page}/${totalPages})`,
      "",
      ...pageLines,
    ];

    return {
      title: "Post",
      lines: this.fit(lines),
      prompt: "> ",
      inputMode: "line",
      hints: ["N 다음 페이지, P 이전 페이지, 0 뒤로"],
      toast,
    };
  }

  private renderWriteTitle(state: Extract<State, { kind: "writeTitle" }>, toast: string | undefined): ScreenModel {
    const board = this.service.getBoard(state.boardId);
    const boardName = board?.name ?? String(state.boardId);
    return {
      title: "Write: Title",
      lines: this.fit([`Board: ${boardName}`, "", "제목을 입력하세요.", "0) 취소"]),
      prompt: "title> ",
      inputMode: "line",
      hints: ["0 취소"],
      toast,
    };
  }

  private renderWriteBody(state: Extract<State, { kind: "writeBody" }>, toast: string | undefined): ScreenModel {
    const board = this.service.getBoard(state.boardId);
    const boardName = board?.name ?? String(state.boardId);

    const header = [`Board: ${boardName}`, `Title: ${state.title}`, ""];
    const bodyPreview = state.lines.length === 0 ? ["(본문 입력 중)"] : state.lines.slice(-Math.max(5, this.ctx.term.rows - 12));
    const lines = [...header, ...bodyPreview];

    return {
      title: "Write: Body",
      lines: this.fit(lines),
      prompt: "body> ",
      inputMode: "multiline",
      hints: [". 완료, 0 취소"],
      toast,
    };
  }

  private fit(lines: string[]): string[] {
    const maxLines = Math.max(5, this.ctx.term.rows - 4);
    return lines.slice(0, maxLines);
  }
}
