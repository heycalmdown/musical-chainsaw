import fs from "node:fs";
import net from "node:net";
import readline from "node:readline";
import { ensureParentDir, getBbsPaths } from "./config";
import type { ResponseMessage } from "./protocol";
import { BbsDb, removeFileIfExists } from "./bbsd/db";
import { BbsService } from "./bbsd/service";
import { Session } from "./bbsd/session";

type RawRequestMessage = { id: number; type: string; payload: any };

function send(socket: net.Socket, msg: ResponseMessage): void {
  socket.write(JSON.stringify(msg) + "\n");
}

function isRequestMessage(v: unknown): v is RawRequestMessage {
  if (!v || typeof v !== "object") return false;
  const msg = v as { id?: unknown; type?: unknown; payload?: unknown };
  return typeof msg.id === "number" && typeof msg.type === "string" && "payload" in msg;
}

function main(): void {
  const { socketPath, dbPath } = getBbsPaths();
  ensureParentDir(socketPath);
  ensureParentDir(dbPath);

  const db = new BbsDb(dbPath);
  db.initSchema();
  db.seedBoardsIfEmpty();

  removeFileIfExists(socketPath);

  const service = new BbsService(db);
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    const rl = readline.createInterface({ input: socket, crlfDelay: Infinity });
    const session = new Session(service);

    rl.on("line", (line) => {
      if (!line.trim()) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line) as unknown;
      } catch {
        send(socket, { id: 0, ok: false, error: { code: "BAD_REQUEST", message: "Invalid JSON" } });
        socket.end();
        return;
      }

      if (!isRequestMessage(parsed)) {
        send(socket, { id: 0, ok: false, error: { code: "BAD_REQUEST", message: "Invalid message shape" } });
        socket.end();
        return;
      }

      const msg = parsed;
      try {
        if (msg.type === "ui.hello") {
          const screen = session.setHello(msg.payload.user, msg.payload.rows, msg.payload.cols);
          send(socket, { id: msg.id, ok: true, payload: { screen } });
          return;
        }

        if (msg.type === "ui.event") {
          const screen = session.handleEvent(msg.payload.input, msg.payload.rows, msg.payload.cols);
          send(socket, { id: msg.id, ok: true, payload: { screen } });
          if (screen.actions?.some((a) => a.type === "exit")) socket.end();
          return;
        }

        send(socket, { id: msg.id, ok: false, error: { code: "BAD_REQUEST", message: "Unknown type" } });
        socket.end();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Internal error";
        send(socket, { id: msg.id, ok: false, error: { code: "INTERNAL", message } });
        socket.end();
      }
    });

    socket.on("close", () => rl.close());
  });

  server.on("error", (err) => {
    console.error("[bbsd] server error:", err);
    process.exitCode = 1;
  });

  server.listen(socketPath, () => {
    try {
      fs.chmodSync(socketPath, 0o660);
    } catch {}
    console.log(`[bbsd] listening on ${socketPath}`);
    console.log(`[bbsd] db: ${dbPath}`);
  });

  const shutdown = () => {
    server.close(() => {
      db.close();
      removeFileIfExists(socketPath);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
