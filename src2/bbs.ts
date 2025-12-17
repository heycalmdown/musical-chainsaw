import net from "node:net";
import { createInterface } from "node:readline/promises";
import readline from "node:readline";
import { getBbsPaths } from "./config";
import type { RequestMessage, ResponseMessage, ScreenModel } from "./protocol";

function clearScreen(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}

function getTermSize(): { rows: number; cols: number } {
  const rows = typeof process.stdout.rows === "number" ? process.stdout.rows : 24;
  const cols = typeof process.stdout.columns === "number" ? process.stdout.columns : 80;
  return { rows, cols };
}

function render(screen: ScreenModel): void {
  clearScreen();
  process.stdout.write(`== ${screen.title} ==\n\n`);
  if (screen.toast) process.stdout.write(`${screen.toast}\n\n`);
  for (const line of screen.lines) process.stdout.write(line + "\n");
  if (screen.hints?.length) {
    process.stdout.write("\n");
    for (const hint of screen.hints) process.stdout.write(hint + "\n");
  }
}

async function main(): Promise<void> {
  const { socketPath } = getBbsPaths();
  const user = (process.env.USER ?? process.env.LOGNAME ?? "unknown").trim() || "unknown";

  const socket = net.createConnection({ path: socketPath });
  socket.setEncoding("utf8");

  let connectionClosed = false;
  let uiRl: ReturnType<typeof createInterface> | undefined;

  const socketRl = readline.createInterface({ input: socket, crlfDelay: Infinity });
  const pending = new Map<number, { resolve: (msg: ResponseMessage) => void; reject: (err: Error) => void }>();

  socketRl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: ResponseMessage;
    try {
      msg = JSON.parse(line) as ResponseMessage;
    } catch {
      return;
    }
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    entry.resolve(msg);
  });

  const request = (msg: RequestMessage) =>
    new Promise<ResponseMessage>((resolve, reject) => {
      pending.set(msg.id, { resolve, reject });
      if (socket.destroyed) {
        pending.delete(msg.id);
        reject(new Error("Socket closed"));
        return;
      }
      socket.write(JSON.stringify(msg) + "\n", (err) => {
        if (err) {
          pending.delete(msg.id);
          reject(err);
        }
      });
    });

  socket.on("error", (err) => {
    console.error("[bbs] socket error:", err.message);
    process.exitCode = 1;
  });
  socket.on("close", () => {
    connectionClosed = true;
    for (const { reject } of pending.values()) reject(new Error("Socket closed"));
    pending.clear();
    socketRl.close();
    uiRl?.close();
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("error", (err) => reject(err));
  });

  let nextId = 1;
  const helloSize = getTermSize();
  const helloRes = await request({
    id: nextId++,
    type: "ui.hello",
    payload: { user, rows: helloSize.rows, cols: helloSize.cols },
  });

  if (!helloRes.ok) {
    console.error(`[bbs] ${helloRes.error.code}: ${helloRes.error.message}`);
    socket.end();
    return;
  }

  let screen = helloRes.payload.screen;
  uiRl = createInterface({ input: process.stdin, output: process.stdout });
  uiRl.on("SIGINT", () => {
    uiRl?.close();
    socket.end();
    process.exit(0);
  });

  while (true) {
    render(screen);
    if (connectionClosed) break;
    if (screen.actions?.some((a) => a.type === "exit")) break;

    let answer: string;
    try {
      answer = await uiRl.question(screen.prompt ?? "> ");
    } catch {
      break;
    }
    if (connectionClosed) break;
    const size = getTermSize();
    let res: ResponseMessage;
    try {
      res = await request({
        id: nextId++,
        type: "ui.event",
        payload: { input: answer, rows: size.rows, cols: size.cols },
      });
    } catch (err) {
      clearScreen();
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[bbs] connection error: ${message}`);
      break;
    }

    if (!res.ok) {
      clearScreen();
      console.error(`[bbs] ${res.error.code}: ${res.error.message}`);
      break;
    }

    screen = res.payload.screen;
  }

  uiRl?.close();
  socket.end();
}

main().catch((err) => {
  console.error("[bbs] fatal:", err);
  process.exitCode = 1;
});
