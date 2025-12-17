export function encodeJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export function splitJsonLines(buffer: string): { lines: string[]; rest: string } {
  const lines: string[] = [];
  let rest = buffer;

  while (true) {
    const newlineIndex = rest.indexOf("\n");
    if (newlineIndex < 0) break;
    const line = rest.slice(0, newlineIndex);
    rest = rest.slice(newlineIndex + 1);
    lines.push(line);
  }

  return { lines, rest };
}

export function safeJsonParse(line: string): { ok: true; value: unknown } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(line) };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

