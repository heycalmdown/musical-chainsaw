import os from "node:os";
import readline from "node:readline";
import { DEFAULT_SOCKET_PATH, resolvePath } from "./config";
import type { Board, Post, PostSummary } from "./domain";
import { IpcClient } from "./ipc/client";

function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[H");
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.replace("T", " ").replace("Z", "");
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
  const lines = text.split(/\r?\n/);
  return lines.flatMap((line) => wrapLine(line, width));
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages.length ? pages : [[]];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getArgValue(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx < 0) return null;
  return argv[idx + 1] ?? null;
}

function parseArgs(argv: string[]) {
  const help = argv.includes("--help") || argv.includes("-h");
  const socket = getArgValue(argv, "--socket");
  const pageSizeRaw = getArgValue(argv, "--page-size");
  const pageSize = pageSizeRaw ? Number(pageSizeRaw) : null;
  return { help, socket, pageSize };
}

function printHelp() {
  console.log(`Usage: tsx src/bbs.ts [--socket <path>] [--page-size <n>]

Env:
  BBS_SOCKET_PATH   Unix socket path (overridden by --socket)
`);
}

type View =
  | { kind: "boards"; boards: Board[] }
  | { kind: "posts"; board: Board; page: number; pageSize: number; posts: PostSummary[] }
  | { kind: "post"; board: Board; postsView: { page: number; pageSize: number; posts: PostSummary[] }; post: Post; page: number }
  | { kind: "writeTitle"; board: Board; postsView: { page: number; pageSize: number; posts: PostSummary[] } }
  | { kind: "writeBody"; board: Board; postsView: { page: number; pageSize: number; posts: PostSummary[] }; title: string; lines: string[] };

async function main() {
  const { help, socket, pageSize } = parseArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    process.exit(0);
  }

  const socketPath = resolvePath(socket ?? process.env.BBS_SOCKET_PATH ?? DEFAULT_SOCKET_PATH);
  const author =
    process.env.SSH_USER ??
    process.env.USER ??
    process.env.LOGNAME ??
    (() => {
      try {
        return os.userInfo().username;
      } catch {
        return "anonymous";
      }
    })();
  const postsPageSize = pageSize && Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 10;

  const ipc = await IpcClient.connect(socketPath);
  ipc.on("disconnect", (error) => {
    clearScreen();
    console.error(`bbsd disconnected: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let busy = false;
  let message: string | null = null;

  const rpc = async <T>(type: string, payload: unknown): Promise<T> => {
    const res = await ipc.request({ type, payload, timeoutMs: 10_000 });
    return res as T;
  };

  const loadBoards = async (): Promise<Board[]> => {
    const payload = await rpc<unknown>("listBoards", {});
    if (!isRecord(payload) || !Array.isArray(payload.boards)) throw new Error("Invalid listBoards response");
    return payload.boards as Board[];
  };

  const loadPosts = async (args: { boardId: number; page: number; pageSize: number }): Promise<PostSummary[]> => {
    const payload = await rpc<unknown>("listPosts", args);
    if (!isRecord(payload) || !Array.isArray(payload.posts)) throw new Error("Invalid listPosts response");
    return payload.posts as PostSummary[];
  };

  const loadPost = async (postId: number): Promise<Post> => {
    const payload = await rpc<unknown>("getPost", { postId });
    if (!isRecord(payload) || !isRecord(payload.post)) throw new Error("Invalid getPost response");
    return payload.post as Post;
  };

  const createPost = async (args: { boardId: number; title: string; body: string; author: string }): Promise<number> => {
    const payload = await rpc<unknown>("createPost", args);
    if (!isRecord(payload) || typeof payload.postId !== "number") throw new Error("Invalid createPost response");
    return payload.postId;
  };

  let view: View = { kind: "boards", boards: await loadBoards() };

  const render = () => {
    clearScreen();
    console.log(`SSH BBS (MVP)  user=${author}  socket=${socketPath}`);
    console.log("");

    if (message) {
      console.log(message);
      console.log("");
      message = null;
    }

    if (view.kind === "boards") {
      console.log("[Main Menu] Select a board:");
      for (let i = 0; i < view.boards.length; i++) {
        console.log(`${i + 1}) ${view.boards[i]!.name}`);
      }
      console.log("0) Exit");
      console.log("");
      rl.setPrompt("> ");
      rl.prompt();
      return;
    }

    if (view.kind === "posts") {
      console.log(`[Board: ${view.board.name}] Page ${view.page}`);
      console.log("");
      if (view.posts.length === 0) {
        console.log("(no posts)");
      } else {
        for (const post of view.posts) {
          console.log(`${post.id}\t${post.title}\t(${post.author}, ${formatDate(post.createdAt)})`);
        }
      }
      console.log("");
      console.log("Commands: N=Next  P=Prev  R <id>=Read  W=Write  0=Back");
      console.log("");
      rl.setPrompt("> ");
      rl.prompt();
      return;
    }

    if (view.kind === "post") {
      const rows = process.stdout.rows ?? 24;
      const cols = process.stdout.columns ?? 80;
      const overhead = 10;
      const bodyHeight = Math.max(rows - overhead, 5);
      const wrappedBody = wrapText(view.post.body, cols);
      const pages = chunk(wrappedBody, bodyHeight);
      const totalPages = pages.length;
      const pageIndex = Math.min(Math.max(view.page - 1, 0), totalPages - 1);

      console.log(`[Board: ${view.board.name}] Post #${view.post.id} (${pageIndex + 1}/${totalPages})`);
      console.log(`Title: ${view.post.title}`);
      console.log(`Author: ${view.post.author}`);
      console.log(`Date: ${formatDate(view.post.createdAt)}`);
      console.log("-".repeat(Math.min(cols, 80)));

      for (const line of pages[pageIndex] ?? []) {
        console.log(line);
      }

      console.log("-".repeat(Math.min(cols, 80)));
      console.log("Commands: N=Next  P=Prev  0=Back");
      console.log("");
      rl.setPrompt("> ");
      rl.prompt();
      return;
    }

    if (view.kind === "writeTitle") {
      console.log(`[Board: ${view.board.name}] Write Post`);
      console.log("Enter title (0 to cancel):");
      console.log("");
      rl.setPrompt("> ");
      rl.prompt();
      return;
    }

    if (view.kind === "writeBody") {
      const rows = process.stdout.rows ?? 24;
      const cols = process.stdout.columns ?? 80;
      const overhead = 8;
      const previewHeight = Math.max(rows - overhead, 5);

      console.log(`[Board: ${view.board.name}] Write Post`);
      console.log(`Title: ${view.title}`);
      console.log("Enter body. '.' on its own line to finish. '0' to cancel.");
      console.log("-".repeat(Math.min(cols, 80)));

      const preview = view.lines.slice(-previewHeight);
      for (const line of preview) {
        console.log(line);
      }

      console.log("-".repeat(Math.min(cols, 80)));
      rl.setPrompt("> ");
      rl.prompt();
    }
  };

  const goBoards = async () => {
    view = { kind: "boards", boards: await loadBoards() };
  };

  const goPosts = async (board: Board, page: number) => {
    const posts = await loadPosts({ boardId: board.id, page, pageSize: postsPageSize });
    view = { kind: "posts", board, page, pageSize: postsPageSize, posts };
  };

  rl.on("line", (line) => {
    void (async () => {
      if (busy) return;
      busy = true;
      try {
        const input = line.trim();

        if (view.kind === "boards") {
          if (input === "0") {
            rl.close();
            ipc.close();
            process.exit(0);
          }

          const selected = Number(input);
          if (!Number.isFinite(selected) || selected < 1 || selected > view.boards.length) {
            message = "Select a board number.";
            return;
          }

          const board = view.boards[selected - 1]!;
          await goPosts(board, 1);
          return;
        }

        if (view.kind === "posts") {
          const cmd = input.toUpperCase();
          if (cmd === "0") {
            await goBoards();
            return;
          }

          if (cmd === "N") {
            await goPosts(view.board, view.page + 1);
            return;
          }

          if (cmd === "P") {
            if (view.page <= 1) {
              message = "Already at first page.";
              return;
            }
            await goPosts(view.board, view.page - 1);
            return;
          }

          if (cmd === "W") {
            view = {
              kind: "writeTitle",
              board: view.board,
              postsView: { page: view.page, pageSize: view.pageSize, posts: view.posts },
            };
            return;
          }

          const readMatch = /^R(?:\s+(\d+))?$/i.exec(input);
          if (readMatch) {
            const postId = readMatch[1] ? Number(readMatch[1]) : NaN;
            if (!Number.isFinite(postId) || postId < 1) {
              message = "Usage: R <postId>";
              return;
            }
            const post = await loadPost(postId);
            view = {
              kind: "post",
              board: view.board,
              postsView: { page: view.page, pageSize: view.pageSize, posts: view.posts },
              post,
              page: 1,
            };
            return;
          }

          message = "Commands: N, P, R <id>, W, 0";
          return;
        }

        if (view.kind === "post") {
          const cmd = input.toUpperCase();
          if (cmd === "0") {
            const { postsView } = view;
            view = { kind: "posts", board: view.board, page: postsView.page, pageSize: postsView.pageSize, posts: postsView.posts };
            return;
          }

          if (cmd === "N") {
            view = { ...view, page: view.page + 1 };
            return;
          }

          if (cmd === "P") {
            view = { ...view, page: Math.max(1, view.page - 1) };
            return;
          }

          message = "Commands: N, P, 0";
          return;
        }

        if (view.kind === "writeTitle") {
          if (input === "0") {
            const { postsView } = view;
            view = { kind: "posts", board: view.board, page: postsView.page, pageSize: postsView.pageSize, posts: postsView.posts };
            return;
          }

          const title = input.trim();
          if (title.length === 0) {
            message = "Title cannot be empty.";
            return;
          }

          view = { kind: "writeBody", board: view.board, postsView: view.postsView, title, lines: [] };
          return;
        }

        if (view.kind === "writeBody") {
          if (input === "0") {
            const { postsView } = view;
            view = { kind: "posts", board: view.board, page: postsView.page, pageSize: postsView.pageSize, posts: postsView.posts };
            return;
          }

          if (input === ".") {
            const body = view.lines.join("\n").trimEnd();
            if (body.trim().length === 0) {
              message = "Body cannot be empty.";
              return;
            }

            const postId = await createPost({ boardId: view.board.id, title: view.title, body, author });
            await goPosts(view.board, 1);
            message = `Posted #${postId}`;
            return;
          }

          view.lines.push(line);
          return;
        }
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      } finally {
        busy = false;
        render();
      }
    })();
  });

  process.on("SIGINT", () => {
    rl.close();
    ipc.close();
    process.exit(0);
  });

  render();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
