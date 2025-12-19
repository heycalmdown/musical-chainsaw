import "@xterm/xterm/css/xterm.css";
import "./style.css";
import { Terminal } from "@xterm/xterm";
import type { CreateSessionResponse, ScreenModel, SessionEventResponse } from "../../src/protocol";

const DEFAULT_ROWS = 24;
const DEFAULT_COLS = 80;

function $(selector: string): HTMLElement {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el as HTMLElement;
}

function sanitizePlainText(value: string): string {
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x1b]/g, "");
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : {};
  if (!res.ok) throw new Error((data as any)?.error?.message ?? `HTTP ${res.status}`);
  return data as T;
}

function normalizePrompt(prompt: string | undefined): string {
  if (typeof prompt !== "string") return "> ";
  const p = sanitizePlainText(prompt);
  return p.length > 0 ? p : "> ";
}

function renderScreen(term: Terminal, screen: ScreenModel, prompt: string, draft: string): void {
  term.reset();

  term.writeln(screen.title);

  if (screen.toast) {
    term.writeln("");
    term.writeln(screen.toast);
  }

  if (screen.lines.length > 0) {
    term.writeln("");
    for (const line of screen.lines) term.writeln(line);
  }

  if (screen.hints?.length) {
    term.writeln("");
    for (const hint of screen.hints) term.writeln(hint);
  }

  if (!shouldExit(screen)) {
    term.writeln("");
    term.write(prompt);
    term.write(draft);
  }
}

function shouldExit(screen: ScreenModel): boolean {
  return Array.isArray(screen.actions) && screen.actions.some((a) => a.type === "exit");
}

async function main(): Promise<void> {
  const nicknameInput = $("#nickname") as HTMLInputElement;
  const connectBtn = $("#connect") as HTMLButtonElement;
  const disconnectBtn = $("#disconnect") as HTMLButtonElement;
  const terminalEl = $("#terminal");

  const term = new Terminal({
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    convertEol: true,
    cursorStyle: "block",
    cursorBlink: false,
    fontFamily: "ui-monospace, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 14,
    theme: {
      background: "#0f1620",
      foreground: "#e7eef7",
    },
  });
  term.open(terminalEl);

  let sessionId: string | null = null;
  let currentPrompt = "> ";
  let draft = "";
  let processing = false;
  const queue: string[] = [];

  const setConnected = (connected: boolean) => {
    nicknameInput.disabled = connected;
    connectBtn.disabled = connected;
    disconnectBtn.disabled = !connected;
    if (connected) term.focus();
  };

  const applyScreen = (screen: ScreenModel) => {
    currentPrompt = normalizePrompt(screen.prompt);
    renderScreen(term, screen, currentPrompt, draft);
  };

  const enqueue = (line: string) => {
    queue.push(line);
    void processQueue();
  };

  const processQueue = async () => {
    if (processing) return;
    if (!sessionId) return;
    processing = true;
    try {
      while (queue.length > 0) {
        const line = queue.shift()!;
        const res = await fetchJson<SessionEventResponse>(`/api/sessions/${sessionId}/events`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: line }),
        });

        applyScreen(res.screen);

        if (shouldExit(res.screen)) {
          sessionId = null;
          setConnected(false);
          draft = "";
          break;
        }
      }
    } catch (error) {
      term.writeln("");
      term.writeln(`[error] ${error instanceof Error ? error.message : String(error)}`);
      sessionId = null;
      setConnected(false);
    } finally {
      processing = false;
    }
  };

  const connect = async () => {
    if (sessionId) return;
    const nickname = sanitizePlainText(nicknameInput.value).trim();
    if (!nickname) {
      nicknameInput.focus();
      return;
    }

    try {
      const res = await fetchJson<CreateSessionResponse>("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname, rows: DEFAULT_ROWS, cols: DEFAULT_COLS }),
      });

      sessionId = res.sessionId;
      setConnected(true);
      draft = "";
      applyScreen(res.screen);
    } catch (error) {
      term.writeln("");
      term.writeln(`[error] ${error instanceof Error ? error.message : String(error)}`);
      sessionId = null;
      setConnected(false);
    }
  };

  const disconnect = async () => {
    if (!sessionId) return;
    const toDelete = sessionId;
    sessionId = null;
    setConnected(false);
    queue.length = 0;
    processing = false;
    draft = "";

    try {
      await fetchJson(`/api/sessions/${toDelete}`, { method: "DELETE" });
    } catch {}
  };

  connectBtn.addEventListener("click", () => void connect());
  disconnectBtn.addEventListener("click", () => void disconnect());

  nicknameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void connect();
  });

  terminalEl.addEventListener("mousedown", () => term.focus());

  term.onData((data) => {
    if (!sessionId) return;
    if (data.startsWith("\x1b")) return;

    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        const line = draft;
        draft = "";
        term.write("\r\n");
        term.write(currentPrompt);
        enqueue(line);
        continue;
      }

      if (ch === "\u007f" || ch === "\b") {
        if (draft.length === 0) continue;
        draft = draft.slice(0, -1);
        term.write("\b \b");
        continue;
      }

      if (ch === "\u0003") {
        void disconnect();
        continue;
      }

      if (/[\x00-\x1f\x7f]/.test(ch)) continue;

      const safe = sanitizePlainText(ch);
      if (!safe) continue;
      draft += safe;
      term.write(safe);
    }
  });

  setConnected(false);
  term.writeln("서버를 먼저 실행하세요: npm run dev:server");
  term.writeln("웹 실행: npm run dev:web");
  term.writeln("");
  term.writeln("터미널을 클릭해서 포커스 후 입력하세요.");
}

void main();
