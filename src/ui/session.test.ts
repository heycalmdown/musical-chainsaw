import assert from "node:assert/strict";
import test from "node:test";
import type { BbsDb } from "../db";
import type { Board, Conference, ConferenceMenuItem, Post, PostSummary } from "../domain";
import { BbsUiSession } from "./session";

const rootConference: Conference = {
  id: "root",
  slug: "root",
  name: "Root",
  isRoot: true,
  welcomeTitle: "",
  welcomeBody: "",
  menuTitle: "",
  menuBody: "",
  updatedAt: "2026-04-01T00:00:00.000Z",
  updatedBy: "system",
};

const board: Board = {
  id: "general",
  conferenceId: "root",
  name: "General",
};

const menuItem: ConferenceMenuItem = {
  id: "menu-1",
  conferenceId: "root",
  label: "General",
  displayNo: "",
  displayType: "",
  actionType: "board",
  actionRef: "general",
  body: "",
  hidden: false,
  updatedAt: "2026-04-01T00:00:00.000Z",
  updatedBy: "system",
};

const postSummary: PostSummary = {
  id: "post-1",
  title: "Hello",
  author: "kei",
  createdAt: "2026-04-01T00:00:00.000Z",
};

const post: Post = {
  id: "post-1",
  conferenceId: "root",
  boardId: "general",
  title: "Hello",
  body: "Body",
  author: "kei",
  createdAt: "2026-04-01T00:00:00.000Z",
};

function unexpected(name: string): never {
  throw new Error(`Unexpected db call: ${name}`);
}

function createFakeDb(): BbsDb {
  return {
    listConferences: async () => [],
    getConference: async () => null,
    getRootConference: async () => rootConference,
    updateConferenceWelcome: async () => unexpected("updateConferenceWelcome"),
    updateConferenceMenu: async () => unexpected("updateConferenceMenu"),
    createConference: async () => unexpected("createConference"),
    renameConference: async () => unexpected("renameConference"),
    deleteConference: async () => unexpected("deleteConference"),
    listMenuItems: async (conferenceId: string) =>
      conferenceId === rootConference.id ? [menuItem] : [],
    getMenuItem: async () => null,
    createMenuItem: async () => unexpected("createMenuItem"),
    deleteMenuItem: async () => unexpected("deleteMenuItem"),
    setMenuItemHidden: async () => unexpected("setMenuItemHidden"),
    updateMenuItemMeta: async () => unexpected("updateMenuItemMeta"),
    updateMenuItemContent: async () => unexpected("updateMenuItemContent"),
    getBoard: async (conferenceId: string, boardId: string) =>
      conferenceId === board.conferenceId && boardId === board.id ? board : null,
    listBoards: async () => [board],
    createBoard: async () => unexpected("createBoard"),
    renameBoard: async () => unexpected("renameBoard"),
    deleteBoard: async () => unexpected("deleteBoard"),
    listPosts: async () => ({ posts: [postSummary], nextCursor: null }),
    getPost: async (postId: string) => (postId === post.id ? post : null),
    createPost: async () => unexpected("createPost"),
    close: async () => undefined,
    getPool: () => unexpected("getPool"),
    getSchemaName: () => "public",
  };
}

async function openPostsSession(timeZone?: string): Promise<BbsUiSession> {
  const session = new BbsUiSession(createFakeDb());
  await session.handleHello({ user: "kei", timeZone });
  await session.handleEvent("");
  await session.handleEvent("1");
  return session;
}

test("posts and post detail render in the session time zone", async () => {
  const session = await openPostsSession("Asia/Seoul");

  const postsScreen = await session.handleEvent("");
  assert.ok(
    postsScreen.lines.some((line) => line.includes("(kei, 2026-04-01 09:00)")),
  );

  const postScreen = await session.handleEvent("R 1");
  assert.ok(postScreen.lines.includes("Date: 2026-04-01 09:00"));
});

test("invalid time zone falls back to UTC formatting", async () => {
  const session = await openPostsSession("Invalid/Zone");
  const postScreen = await session.handleEvent("R 1");

  assert.ok(postScreen.lines.includes("Date: 2026-04-01 00:00"));
});

test("updated time zone persists through serialize and deserialize", async () => {
  const session = await openPostsSession("UTC");
  session.setTerminalContext({ timeZone: "America/Los_Angeles" });

  const restored = BbsUiSession.deserialize(createFakeDb(), session.serialize());
  const postScreen = await restored.handleEvent("R 1");

  assert.ok(postScreen.lines.includes("Date: 2026-03-31 17:00"));
});
