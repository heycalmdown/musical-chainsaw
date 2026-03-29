export type AnsiColor =
  | "default"
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white";

export type TextSpan = {
  text: string;
  fg?: AnsiColor;
  inverse?: boolean;
};

export type ScreenNode =
  | { type: "clearScreen" }
  | { type: "line"; spans: TextSpan[] };

export type StoredRichScreen = ScreenNode[];

const ANSI_FG_CODE: Record<AnsiColor, number> = {
  default: 39,
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
};

const VALID_COLORS = new Set<AnsiColor>([
  "default",
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
]);

function sanitizePlainText(value: string): string {
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x1b]/g, "");
}

function escapeMarkupText(value: string): string {
  return value.replace(/\[/g, "\\[");
}

function unescapeMarkupText(value: string): string {
  return value.replace(/\\\[/g, "[");
}

function pushTextSpan(
  spans: TextSpan[],
  text: string,
  style: { fg?: AnsiColor; inverse?: boolean },
): void {
  if (!text) return;
  const safeText = sanitizePlainText(text);
  if (!safeText) return;

  const prev = spans[spans.length - 1];
  if (
    prev &&
    prev.fg === style.fg &&
    Boolean(prev.inverse) === Boolean(style.inverse)
  ) {
    prev.text += safeText;
    return;
  }

  const span: TextSpan = { text: safeText };
  if (style.fg) span.fg = style.fg;
  if (style.inverse) span.inverse = true;
  spans.push(span);
}

function styleToSgr(style: { fg?: AnsiColor; inverse?: boolean }): string {
  const codes: number[] = [];
  if (style.fg) codes.push(ANSI_FG_CODE[style.fg]);
  if (style.inverse) codes.push(7);
  return codes.length > 0 ? `\x1b[${codes.join(";")}m` : "";
}

function spansToAnsi(spans: TextSpan[]): string {
  let out = "";
  for (const span of spans) {
    const text = sanitizePlainText(span.text);
    if (!text) continue;
    const style = styleToSgr(span);
    if (style) out += style;
    out += text;
    if (style) out += "\x1b[0m";
  }
  return out;
}

function validateDoc(doc: StoredRichScreen): void {
  for (const node of doc) {
    if (node.type === "clearScreen") continue;
    if (node.type !== "line") throw new Error("Unsupported rich screen node.");
    if (!Array.isArray(node.spans)) throw new Error("Line node must contain spans.");
    for (const span of node.spans) {
      if (typeof span.text !== "string") throw new Error("Span text must be a string.");
      if (typeof span.fg !== "undefined" && !VALID_COLORS.has(span.fg)) {
        throw new Error(`Unsupported ANSI color: ${String(span.fg)}`);
      }
      if (typeof span.inverse !== "undefined" && typeof span.inverse !== "boolean") {
        throw new Error("Span inverse must be boolean.");
      }
    }
  }
}

export function plainTextToRichScreen(text: string): StoredRichScreen {
  return sanitizePlainText(text)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => ({ type: "line", spans: [{ text: line }] }));
}

export function parseMarkupToRichScreen(input: string): StoredRichScreen {
  const normalized = input.replace(/\r\n/g, "\n");
  const nodes: StoredRichScreen = [];
  let spans: TextSpan[] = [];
  let textBuf = "";
  const styleStack: Array<{ fg?: AnsiColor; inverse?: boolean }> = [{}];
  const tagStack: Array<"fg" | "inv"> = [];

  const flushText = () => {
    if (!textBuf) return;
    const current = styleStack[styleStack.length - 1]!;
    pushTextSpan(spans, unescapeMarkupText(textBuf), current);
    textBuf = "";
  };

  const flushLine = () => {
    flushText();
    nodes.push({ type: "line", spans });
    spans = [];
  };

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]!;
    if (ch === "\\") {
      const next = normalized[i + 1];
      if (next === "[") {
        textBuf += "\\[";
        i += 1;
        continue;
      }
    }

    if (ch === "\n") {
      flushLine();
      continue;
    }

    if (ch !== "[") {
      textBuf += ch;
      continue;
    }

    const closeIndex = normalized.indexOf("]", i);
    if (closeIndex === -1) {
      textBuf += ch;
      continue;
    }

    const token = normalized.slice(i, closeIndex + 1);
    flushText();

    if (token === "[clear]") {
      if (spans.length > 0) {
        nodes.push({ type: "line", spans });
        spans = [];
      }
      nodes.push({ type: "clearScreen" });
      i = closeIndex;
      continue;
    }

    if (token === "[inv]") {
      const prev = styleStack[styleStack.length - 1]!;
      styleStack.push({ ...prev, inverse: true });
      tagStack.push("inv");
      i = closeIndex;
      continue;
    }

    if (token === "[/inv]") {
      if (tagStack.pop() !== "inv") {
        throw new Error("Mismatched [/inv] tag.");
      }
      styleStack.pop();
      i = closeIndex;
      continue;
    }

    if (token.startsWith("[fg=") && token.endsWith("]")) {
      const value = token.slice(4, -1).trim() as AnsiColor;
      if (!VALID_COLORS.has(value)) throw new Error(`Unsupported color: ${value}`);
      const prev = styleStack[styleStack.length - 1]!;
      styleStack.push({ ...prev, fg: value });
      tagStack.push("fg");
      i = closeIndex;
      continue;
    }

    if (token === "[/fg]") {
      if (tagStack.pop() !== "fg") {
        throw new Error("Mismatched [/fg] tag.");
      }
      styleStack.pop();
      i = closeIndex;
      continue;
    }

    textBuf += token;
    i = closeIndex;
  }

  flushText();
  if (styleStack.length !== 1) throw new Error("Unclosed markup tag.");
  if (spans.length > 0 || nodes.length === 0) {
    nodes.push({ type: "line", spans });
  }

  validateDoc(nodes);
  return nodes;
}

export function richScreenToMarkup(doc: StoredRichScreen): string {
  validateDoc(doc);
  const parts: string[] = [];
  for (const node of doc) {
    if (node.type === "clearScreen") {
      parts.push("[clear]");
      continue;
    }

    let line = "";
    for (const span of node.spans) {
      const text = escapeMarkupText(sanitizePlainText(span.text));
      if (!text) continue;
      if (span.fg) line += `[fg=${span.fg}]`;
      if (span.inverse) line += "[inv]";
      line += text;
      if (span.inverse) line += "[/inv]";
      if (span.fg) line += "[/fg]";
    }
    parts.push(line);
  }
  return parts.join("\n");
}

export function renderRichScreenToAnsi(doc: StoredRichScreen): string {
  validateDoc(doc);
  let out = "";
  for (const node of doc) {
    if (node.type === "clearScreen") {
      out += "\x1b[H\x1b[2J";
      continue;
    }
    out += spansToAnsi(node.spans);
    out += "\r\n";
  }
  return out;
}

export function validateMarkup(input: string): string {
  parseMarkupToRichScreen(input);
  return input.replace(/\r\n/g, "\n");
}
