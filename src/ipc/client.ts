import net from "node:net";
import { EventEmitter } from "node:events";
import { encodeJsonLine, safeJsonParse, splitJsonLines } from "./jsonl";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class IpcClientError extends Error {
  readonly code: string;

  constructor(args: { code: string; message: string }) {
    super(args.message);
    this.name = "IpcClientError";
    this.code = args.code;
  }
}

export class IpcClient extends EventEmitter {
  private readonly socket: net.Socket;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (payload: unknown) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout | null }
  >();

  private constructor(socket: net.Socket) {
    super();
    this.socket = socket;
    this.socket.setEncoding("utf8");
    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("close", () => this.onClose());
    this.socket.on("error", (error) => this.onError(error));
  }

  static connect(socketPath: string): Promise<IpcClient> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(socketPath);
      socket.once("connect", () => resolve(new IpcClient(socket)));
      socket.once("error", reject);
    });
  }

  close() {
    this.socket.end();
    this.socket.destroy();
  }

  async request(args: { type: string; payload: unknown; timeoutMs?: number }): Promise<unknown> {
    const id = this.nextId++;
    const timeoutMs = args.timeoutMs ?? 5_000;

    const payload = await new Promise<unknown>((resolve, reject) => {
      const timeout =
        timeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(id);
              reject(new IpcClientError({ code: "TIMEOUT", message: `Request timed out: ${args.type}` }));
            }, timeoutMs)
          : null;

      this.pending.set(id, { resolve, reject, timeout });
      this.socket.write(encodeJsonLine({ id, type: args.type, payload: args.payload }));
    });

    return payload;
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    const { lines, rest } = splitJsonLines(this.buffer);
    this.buffer = rest;

    for (const line of lines) {
      const trimmedLine = line.trimEnd();
      if (trimmedLine.trim().length === 0) continue;

      const parsed = safeJsonParse(trimmedLine);
      if (!parsed.ok) continue;
      this.onMessage(parsed.value);
    }
  }

  private onMessage(value: unknown) {
    if (!isRecord(value)) return;
    const id = value.id;
    if (typeof id !== "number") return;

    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    if (pending.timeout) clearTimeout(pending.timeout);

    const ok = value.ok;
    if (ok === true) {
      pending.resolve(value.payload);
      return;
    }

    if (ok === false && isRecord(value.error)) {
      const code = typeof value.error.code === "string" ? value.error.code : "ERROR";
      const message = typeof value.error.message === "string" ? value.error.message : "Unknown error";
      pending.reject(new IpcClientError({ code, message }));
      return;
    }

    pending.reject(new IpcClientError({ code: "PROTOCOL", message: "Invalid response shape" }));
  }

  private onClose() {
    for (const [id, pending] of this.pending.entries()) {
      if (pending.timeout) clearTimeout(pending.timeout);
      pending.reject(new IpcClientError({ code: "DISCONNECTED", message: "Disconnected from bbsd" }));
      this.pending.delete(id);
    }
    this.emit("disconnect", new IpcClientError({ code: "DISCONNECTED", message: "Disconnected from bbsd" }));
  }

  private onError(error: Error) {
    for (const [id, pending] of this.pending.entries()) {
      if (pending.timeout) clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
    this.emit("disconnect", error);
  }
}
