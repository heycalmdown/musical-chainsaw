import assert from "node:assert/strict";
import test from "node:test";
import { findMenuHotspots, findPostsHotspots } from "./menu-hotspot";

test("findMenuHotspots splits a menu line by numbered entries", () => {
  const hotspots = findMenuHotspots([
    "[ 기본서비스 ]    1. 안내",
    "[ 커뮤니티 ]    2. 게시판    3. 동호회",
  ]);

  assert.deepEqual(hotspots, [
    { line: 0, start: 13, end: 18, input: "1" },
    { line: 1, start: 12, end: 22, input: "2" },
    { line: 1, start: 22, end: 28, input: "3" },
  ]);
});

test("findMenuHotspots ignores lines without menu-like numbers", () => {
  const hotspots = findMenuHotspots([
    "https://bbs.kson.live",
    "후원링크 => https://github.com/example/project",
    "선택> ",
  ]);

  assert.deepEqual(hotspots, []);
});

test("findMenuHotspots keeps multiline column menus clickable by dot rule", () => {
  const hotspots = findMenuHotspots([
    "1. 어쩌구        200. 동호회 1",
    "2. 저쩌구        201. 동호회 2",
    "3. 랄랄라",
  ]);

  assert.deepEqual(hotspots, [
    { line: 0, start: 0, end: 14, input: "1" },
    { line: 0, start: 14, end: 24, input: "200" },
    { line: 1, start: 0, end: 14, input: "2" },
    { line: 1, start: 14, end: 24, input: "201" },
    { line: 2, start: 0, end: 6, input: "3" },
  ]);
});

test("findMenuHotspots ignores trailing numbers that are not menu prefixes", () => {
  const hotspots = findMenuHotspots([
    "200. 동호회 1",
    "201. 동호회 2",
  ]);

  assert.deepEqual(hotspots, [
    { line: 0, start: 0, end: 10, input: "200" },
    { line: 1, start: 0, end: 10, input: "201" },
  ]);
});

test("findPostsHotspots makes the whole post row clickable", () => {
  const hotspots = findPostsHotspots([
    "[Conference: Lobby] [Board: 자유게시판] Page 1",
    "",
    "번호 이름         날짜  제목",
    "--------------------------------------------------------------------------------",
    "1    kei          04-03 Hello",
    "2    낭만자       04-03 도배",
    "10   행인1        04-02 블루라이트 노출되면 수면에 방해되는데",
  ]);

  assert.deepEqual(hotspots, [
    { line: 4, start: 0, end: 29, input: "1" },
    { line: 5, start: 0, end: 23, input: "2" },
    { line: 6, start: 0, end: 42, input: "10" },
  ]);
});
