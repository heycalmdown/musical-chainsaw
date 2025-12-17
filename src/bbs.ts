import os from "node:os";
import readline from "node:readline";
import { DEFAULT_SOCKET_PATH, resolvePath } from "./config";
import { IpcClient } from "./ipc/client";
import type { ScreenModel } from "./ipc/types";

function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[H");
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

function getUser(): string {
  const fromEnv = process.env.SSH_USER ?? process.env.USER ?? process.env.LOGNAME;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();

  try {
    return os.userInfo().username;
  } catch {
    return "anonymous";
  }
}

function getTerminalSize(): { rows: number; cols: number } {
  return { rows: process.stdout.rows ?? 24, cols: process.stdout.columns ?? 80 };
}

function asScreenModel(payload: unknown): ScreenModel {
  if (!isRecord(payload) || !isRecord(payload.screen)) throw new Error("Invalid ui response (missing screen)");
  const screen = payload.screen as ScreenModel;
  if (typeof screen.title !== "string") throw new Error("Invalid ui response (screen.title)");
  if (!Array.isArray(screen.lines)) throw new Error("Invalid ui response (screen.lines)");
  if (typeof screen.prompt !== "string") throw new Error("Invalid ui response (screen.prompt)");
  return screen;
}

function shouldExit(screen: ScreenModel): boolean {
  return Array.isArray(screen.actions) && screen.actions.some((action) => action.type === "exit");
}

async function main() {
  const { help, socket, pageSize } = parseArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    process.exit(0);
  }

  const socketPath = resolvePath(socket ?? process.env.BBS_SOCKET_PATH ?? DEFAULT_SOCKET_PATH);
  const user = getUser();
  const postsPageSize = pageSize && Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : undefined;

  const ipc = await IpcClient.connect(socketPath);
  ipc.on("disconnect", (error) => {
    clearScreen();
    console.error(`bbsd disconnected: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const rpc = async (type: string, payload: unknown): Promise<unknown> => {
    return await ipc.request({ type, payload, timeoutMs: 10_000 });
  };

  const renderScreen = (screen: ScreenModel) => {
    clearScreen();

    console.log(screen.title);
    if (screen.toast) {
      console.log("");
      console.log(screen.toast);
    }

    if (screen.lines.length > 0) {
      console.log("");
      for (const line of screen.lines) console.log(line);
    }

    if (screen.hints && screen.hints.length > 0) {
      console.log("");
      for (const hint of screen.hints) console.log(hint);
    }

    if (shouldExit(screen)) {
      rl.close();
      ipc.close();
      process.exit(0);
    }

    rl.setPrompt(screen.prompt);
    rl.prompt();
  };

  const sendHello = async () => {
    const { rows, cols } = getTerminalSize();
    const payload = await rpc("ui.hello", { user, rows, cols, pageSize: postsPageSize });
    renderScreen(asScreenModel(payload));
  };

  const sendEvent = async (input: string) => {
    const { rows, cols } = getTerminalSize();
    const payload = await rpc("ui.event", { input, rows, cols });
    renderScreen(asScreenModel(payload));
  };

  const queue: string[] = [];
  let processing = false;

  const processQueue = async () => {
    if (processing) return;
    processing = true;
    try {
      while (queue.length > 0) {
        const line = queue.shift()!;
        await sendEvent(line);
      }
    } finally {
      processing = false;
    }
  };

  rl.on("line", (line) => {
    queue.push(line);
    void processQueue().catch((error) => {
      clearScreen();
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
  });

  process.on("SIGINT", () => {
    rl.close();
    ipc.close();
    process.exit(0);
  });

  await sendHello();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
