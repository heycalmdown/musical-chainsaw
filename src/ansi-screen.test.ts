import assert from "node:assert/strict";
import test from "node:test";
import {
  parseMarkupToRichScreen,
  renderRichScreenToAnsi,
  richScreenToMarkup,
  validateMarkup,
} from "./ansi-screen";

test("parse markup to ANSI-subset IR", () => {
  const doc = parseMarkupToRichScreen("[clear]\n[fg=red]RED[/fg] [inv]INV[/inv]");
  assert.deepEqual(doc, [
    { type: "clearScreen" },
    { type: "line", spans: [] },
    {
      type: "line",
      spans: [
        { text: "RED", fg: "red" },
        { text: " " },
        { text: "INV", inverse: true },
      ],
    },
  ]);
});

test("validated markup stays in source form while mapping to same IR", () => {
  const markup = validateMarkup("[fg=blue][inv]hello[/inv][/fg]");
  const doc = parseMarkupToRichScreen(markup);
  assert.equal(markup, "[fg=blue][inv]hello[/inv][/fg]");
  assert.equal(richScreenToMarkup(doc), "[fg=blue][inv]hello[/inv][/fg]");
});

test("unknown bracketed text stays literal without escaping", () => {
  const markup = "[ 기본서비스 ] 1. 안내/가입";
  const doc = parseMarkupToRichScreen(markup);
  assert.deepEqual(doc, [
    {
      type: "line",
      spans: [{ text: "[ 기본서비스 ] 1. 안내/가입" }],
    },
  ]);
  assert.equal(validateMarkup(markup), markup);
});

test("render ANSI for color, inverse, and clear", () => {
  const ansi = renderRichScreenToAnsi(
    parseMarkupToRichScreen("[clear]\n[fg=red]RED[/fg] [inv]INV[/inv]"),
  );
  assert.match(ansi, /\x1b\[H\x1b\[2J/);
  assert.match(ansi, /\x1b\[31mRED\x1b\[0m/);
  assert.match(ansi, /\x1b\[7mINV\x1b\[0m/);
});

test("reject malformed markup", () => {
  assert.throws(() => parseMarkupToRichScreen("[/fg]broken"));
  assert.throws(() => parseMarkupToRichScreen("[fg=orange]bad[/fg]"));
  assert.throws(() => parseMarkupToRichScreen("[inv]oops"));
});
