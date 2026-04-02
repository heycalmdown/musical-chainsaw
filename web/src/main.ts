import "@xterm/xterm/css/xterm.css";
import "./style.css";
import { Terminal } from "@xterm/xterm";
import { APP_NAME } from "../../src/app-meta";
import type {
  CreateSessionResponse,
  ScreenModel,
  SessionEventResponse,
} from "../../src/protocol";
import { renderRichScreenToAnsi } from "../../src/ansi-screen";

const DEFAULT_ROWS = 24;
const DEFAULT_COLS = 80;
const MIN_ROWS = 10;
const MAX_ROWS = 200;
const DEFAULT_PROMPT = "선택> ";

function $(selector: string): HTMLElement {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el as HTMLElement;
}

function sanitizePlainText(value: string): string {
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x1b]/g, "");
}

function splitGraphemes(value: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), (segment) => segment.segment);
  }
  return Array.from(value);
}

function isFullWidthCodePoint(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (
      codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    )
  );
}

function codePointWidth(codePoint: number): number {
  if (
    codePoint === 0 ||
    codePoint < 0x20 ||
    (codePoint >= 0x7f && codePoint < 0xa0) ||
    (codePoint >= 0x300 && codePoint <= 0x36f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
  ) {
    return 0;
  }

  return isFullWidthCodePoint(codePoint) ? 2 : 1;
}

function graphemeWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (typeof codePoint !== "number") continue;
    width += codePointWidth(codePoint);
  }
  return Math.max(width, 1);
}

function textWidth(value: string): number {
  return splitGraphemes(value).reduce((sum, grapheme) => sum + graphemeWidth(grapheme), 0);
}

function moveCursorLeft(width: number): string {
  return width > 0 ? `\x1b[${width}D` : "";
}

function moveCursorRight(width: number): string {
  return width > 0 ? `\x1b[${width}C` : "";
}

function updateDraftAtCursor(
  value: string,
  cursor: number,
  nextGraphemes: string[],
): { draft: string; cursor: number } {
  const graphemes = splitGraphemes(value);
  graphemes.splice(cursor, 0, ...nextGraphemes);
  return {
    draft: graphemes.join(""),
    cursor: cursor + nextGraphemes.length,
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch("https://api.kson.live" + url, init);
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : {};
  if (!res.ok)
    throw new Error((data as any)?.error?.message ?? `HTTP ${res.status}`);
  return data as T;
}

function normalizePrompt(prompt: string | undefined): string {
  if (typeof prompt !== "string") return DEFAULT_PROMPT;
  return sanitizePlainText(prompt);
}

function writeSoftClear(term: Terminal): void {
  term.write("\r\n".repeat(term.rows));
  term.write("\x1b[H\x1b[2J");
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function getBrowserTimeZone(): string | undefined {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof timeZone === "string" && timeZone.trim().length > 0
    ? timeZone
    : undefined;
}

function appendScreen(term: Terminal, screen: ScreenModel): void {
  for (const node of screen.ansiIr) {
    if (node.type === "clearScreen") {
      writeSoftClear(term);
      continue;
    }
    term.write(renderRichScreenToAnsi([node]));
  }
}

function shouldShowPrompt(screen: ScreenModel): boolean {
  return normalizePrompt(screen.prompt).length > 0 && !(
    Array.isArray(screen.actions) &&
    screen.actions.some((action) => action.type === "exit")
  );
}

function shouldExit(screen: ScreenModel): boolean {
  return (
    Array.isArray(screen.actions) &&
    screen.actions.some((a) => a.type === "exit")
  );
}

async function main(): Promise<void> {
  const appEl = $("#app");
  const nicknameInput = $("#nickname") as HTMLInputElement;
  const connectBtn = $("#connect") as HTMLButtonElement;
  const disconnectBtn = $("#disconnect") as HTMLButtonElement;
  const terminalEl = $("#terminal");
  const brandEl = $(".brand");

  document.title = APP_NAME;
  brandEl.textContent = APP_NAME;

  const term = new Terminal({
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    convertEol: true,
    cursorStyle: "block",
    cursorBlink: true,
    fontFamily:
      "ui-monospace, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: 21,
    theme: {
      background: "#1900b8",
      foreground: "#e7eef7",
    },
  });
  term.open(terminalEl);

  let sessionId: string | null = null;
  let lastScreen: ScreenModel | null = null;
  let currentPrompt = "> ";
  let draft = "";
  let cursor = 0;
  let processing = false;
  const queue: string[] = [];
  const timeZone = getBrowserTimeZone();

  const getTerminalRows = () => {
    const styles = window.getComputedStyle(terminalEl);
    const availableHeight =
      terminalEl.clientHeight -
      Number.parseFloat(styles.paddingTop) -
      Number.parseFloat(styles.paddingBottom);

    const measureEl = terminalEl.querySelector(
      ".xterm-char-measure-element",
    ) as HTMLElement | null;
    const rect = measureEl?.getBoundingClientRect();
    const cellHeight = rect?.height && rect.height > 0 ? rect.height : 25.2;

    return clampInt(
      Math.floor(Math.max(availableHeight, cellHeight) / cellHeight),
      MIN_ROWS,
      MAX_ROWS,
    );
  };

  const resizeTerminal = () => {
    const nextRows = getTerminalRows();
    if (term.rows !== nextRows) {
      term.resize(DEFAULT_COLS, nextRows);
      if (lastScreen) {
        writeSoftClear(term);
        appendScreen(term, lastScreen);
        if (shouldShowPrompt(lastScreen)) {
          term.write(currentPrompt);
          term.write(draft);
          const tail = splitGraphemes(draft).slice(cursor).join("");
          term.write(moveCursorLeft(textWidth(tail)));
        }
      }
    }
    return { cols: DEFAULT_COLS, rows: nextRows };
  };

  const getTerminalSize = () => ({
    cols: DEFAULT_COLS,
    rows: term.rows,
  });

  const setConnected = (connected: boolean) => {
    appEl.classList.toggle("connected", connected);
    nicknameInput.disabled = connected;
    connectBtn.disabled = connected;
    disconnectBtn.disabled = !connected;
    if (connected) term.focus();
  };

  const applyScreen = (screen: ScreenModel) => {
    lastScreen = screen;
    currentPrompt = normalizePrompt(screen.prompt);
    appendScreen(term, screen);
    if (shouldShowPrompt(screen)) {
      term.write(currentPrompt);
      term.write(draft);
    }
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
        const res = await fetchJson<SessionEventResponse>(
          `/chol/sessions/${sessionId}/events`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ input: line, ...getTerminalSize(), timeZone }),
          },
        );

        if (res.kind === "screen") {
          applyScreen(res.screen);
        }

        if (res.kind === "screen" && shouldExit(res.screen)) {
          sessionId = null;
          setConnected(false);
          draft = "";
          cursor = 0;
          queue.length = 0;
          break;
        }
      }
    } catch (error) {
      term.writeln("");
      term.writeln(
        `[error] ${error instanceof Error ? error.message : String(error)}`,
      );
      sessionId = null;
      setConnected(false);
      cursor = 0;
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
      setConnected(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const terminalSize = resizeTerminal();
      const res = await fetchJson<CreateSessionResponse>("/chol/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nickname,
          rows: terminalSize.rows,
          cols: terminalSize.cols,
          timeZone,
        }),
      });

      sessionId = res.sessionId;
      draft = "";
      cursor = 0;
      applyScreen(res.screen);
    } catch (error) {
      term.writeln("");
      term.writeln(
        `[error] ${error instanceof Error ? error.message : String(error)}`,
      );
      sessionId = null;
      setConnected(false);
      cursor = 0;
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
    cursor = 0;

    try {
      await fetchJson(`/chol/sessions/${toDelete}`, { method: "DELETE" });
    } catch {}
  };

  connectBtn.addEventListener("click", () => void connect());
  disconnectBtn.addEventListener("click", () => void disconnect());
  window.addEventListener("resize", resizeTerminal);
  resizeTerminal();

  nicknameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void connect();
  });

  terminalEl.addEventListener("mousedown", () => term.focus());

  term.onData((data) => {
    if (!sessionId) return;
    if (data.startsWith("\x1b")) return;
    const acceptBufferedInput = !processing;
    const normalizedData = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    for (const ch of normalizedData) {
      if (ch === "\n") {
        if (!acceptBufferedInput) continue;
        const line = draft;
        draft = "";
        cursor = 0;
        term.write("\r\n");
        enqueue(line);
        continue;
      }

      if (ch === "\u007f" || ch === "\b") {
        if (!acceptBufferedInput) continue;
        if (cursor === 0) continue;
        const graphemes = splitGraphemes(draft);
        const removed = graphemes[cursor - 1];
        if (!removed) continue;
        const suffix = graphemes.slice(cursor).join("");
        const removedWidth = graphemeWidth(removed);
        const suffixWidth = textWidth(suffix);
        graphemes.splice(cursor - 1, 1);
        draft = graphemes.join("");
        cursor -= 1;
        term.write(
          moveCursorLeft(removedWidth) +
            suffix +
            " ".repeat(removedWidth) +
            moveCursorLeft(suffixWidth + removedWidth),
        );
        continue;
      }

      if (ch === "\u0003") {
        void disconnect();
        continue;
      }

      if (!acceptBufferedInput) continue;

      if (ch === "\u0001") {
        const prefix = splitGraphemes(draft).slice(0, cursor).join("");
        cursor = 0;
        term.write(moveCursorLeft(textWidth(prefix)));
        continue;
      }

      if (ch === "\u0002") {
        if (cursor === 0) continue;
        const graphemes = splitGraphemes(draft);
        cursor -= 1;
        term.write(moveCursorLeft(graphemeWidth(graphemes[cursor] ?? "")));
        continue;
      }

      if (ch === "\u0005") {
        const suffix = splitGraphemes(draft).slice(cursor).join("");
        cursor = splitGraphemes(draft).length;
        term.write(moveCursorRight(textWidth(suffix)));
        continue;
      }

      if (ch === "\u0006") {
        const graphemes = splitGraphemes(draft);
        if (cursor >= graphemes.length) continue;
        term.write(moveCursorRight(graphemeWidth(graphemes[cursor] ?? "")));
        cursor += 1;
        continue;
      }

      if (ch === "\u000b") {
        const graphemes = splitGraphemes(draft);
        const suffix = graphemes.slice(cursor).join("");
        const suffixWidth = textWidth(suffix);
        if (suffixWidth === 0) continue;
        draft = graphemes.slice(0, cursor).join("");
        term.write(" ".repeat(suffixWidth) + moveCursorLeft(suffixWidth));
        continue;
      }

      if (ch === "\u0015") {
        if (cursor === 0) continue;
        const graphemes = splitGraphemes(draft);
        const prefix = graphemes.slice(0, cursor).join("");
        const suffix = graphemes.slice(cursor).join("");
        const prefixWidth = textWidth(prefix);
        const suffixWidth = textWidth(suffix);
        draft = suffix;
        cursor = 0;
        term.write(
          moveCursorLeft(prefixWidth) +
            suffix +
            " ".repeat(prefixWidth) +
            moveCursorLeft(suffixWidth + prefixWidth),
        );
        continue;
      }

      if (/[\x00-\x1f\x7f]/.test(ch)) continue;

      const safe = sanitizePlainText(ch);
      if (!safe) continue;
      const inserted = splitGraphemes(safe);
      const graphemes = splitGraphemes(draft);
      const suffix = graphemes.slice(cursor).join("");
      const suffixWidth = textWidth(suffix);
      const next = updateDraftAtCursor(draft, cursor, inserted);
      draft = next.draft;
      cursor = next.cursor;
      term.write(safe + suffix + moveCursorLeft(suffixWidth));
    }
  });

  setConnected(false);
  nicknameInput.focus();
  term.writeln("닉네임을 입력하고 [접속] 버튼을 누르세요.");
  term.writeln("접속 후 터미널을 클릭해서 포커스 후 입력하세요.");
}

void main();
