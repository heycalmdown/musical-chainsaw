export type ScreenHotspot = {
  line: number;
  start: number;
  end: number;
  input: string;
};

const MENU_NUMBER_PATTERN = /\d+\.(?=\s|$)/g;
const POSTS_NUMBER_PATTERN = /^\s*(\d+)\s+/;

export function findMenuHotspots(lines: readonly string[]): ScreenHotspot[] {
  const hotspots: ScreenHotspot[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const matches = Array.from(line.matchAll(MENU_NUMBER_PATTERN));
    if (matches.length === 0) continue;

    for (let i = 0; i < matches.length; i += 1) {
      const match = matches[i]!;
      const input = match[0].slice(0, -1);
      const start = match.index ?? 0;
      const next = matches[i + 1];
      const end = next?.index ?? line.length;

      hotspots.push({
        line: lineIndex,
        start,
        end,
        input,
      });
    }
  }

  return hotspots;
}

export function findPostsHotspots(lines: readonly string[]): ScreenHotspot[] {
  const hotspots: ScreenHotspot[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const match = line.match(POSTS_NUMBER_PATTERN);
    if (!match) continue;

    const input = match[1];
    if (!input) continue;

    hotspots.push({
      line: lineIndex,
      start: 0,
      end: line.length,
      input,
    });
  }

  return hotspots;
}
