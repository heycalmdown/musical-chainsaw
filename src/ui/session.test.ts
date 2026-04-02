import assert from "node:assert/strict";
import test from "node:test";
import type { BbsDb } from "../db";
import type { Board, Conference, ConferenceMenuItem, Post, PostSummary } from "../domain";
import type { SessionEventResponse } from "../protocol";
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

function createFakeDb(overrides: Partial<BbsDb> = {}): BbsDb {
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
    ...overrides,
  };
}

function expectScreen(result: SessionEventResponse) {
  assert.equal(result.kind, "screen");
  return result.screen;
}

async function openPostsSession(timeZone?: string): Promise<BbsUiSession> {
  const session = new BbsUiSession(createFakeDb());
  await session.handleHello({ user: "kei", timeZone });
  expectScreen(await session.handleEvent(""));
  expectScreen(await session.handleEvent("1"));
  return session;
}

test("posts and post detail render in the session time zone", async () => {
  const session = await openPostsSession("Asia/Seoul");

  const postsScreen = expectScreen(await session.handleEvent(""));
  assert.ok(
    postsScreen.lines.some((line) => line.includes("(kei, 2026-04-01 09:00)")),
  );

  const postScreen = expectScreen(await session.handleEvent("R 1"));
  assert.ok(postScreen.lines.includes("Date: 2026-04-01 09:00"));
});

test("invalid time zone falls back to UTC formatting", async () => {
  const session = await openPostsSession("Invalid/Zone");
  const postScreen = expectScreen(await session.handleEvent("R 1"));

  assert.ok(postScreen.lines.includes("Date: 2026-04-01 00:00"));
});

test("updated time zone persists through serialize and deserialize", async () => {
  const session = await openPostsSession("UTC");
  session.setTerminalContext({ timeZone: "America/Los_Angeles" });

  const restored = BbsUiSession.deserialize(createFakeDb(), session.serialize());
  const postScreen = expectScreen(await restored.handleEvent("R 1"));

  assert.ok(postScreen.lines.includes("Date: 2026-03-31 17:00"));
});

test("welcome screen uses a plain prompt", async () => {
  const session = new BbsUiSession(createFakeDb());
  const welcomeScreen = await session.handleHello({ user: "kei" });

  assert.equal(welcomeScreen.prompt, "> ");
});

test("write body line input is accepted without returning a new screen", async () => {
  let createPostCalls = 0;
  const session = new BbsUiSession(
    createFakeDb({
      createPost: async () => {
        createPostCalls += 1;
        return "post-2";
      },
    }),
  );

  await session.handleHello({ user: "kei" });
  expectScreen(await session.handleEvent(""));
  expectScreen(await session.handleEvent("1"));
  expectScreen(await session.handleEvent("W"));
  expectScreen(await session.handleEvent("title"));

  const accepted = await session.handleEvent("body line");
  assert.deepEqual(accepted, { kind: "accepted" });
  assert.equal(createPostCalls, 0);

  const completed = expectScreen(await session.handleEvent("."));
  assert.ok(completed.toast?.includes("Posted."));
  assert.equal(createPostCalls, 1);
});

test("write title uses the title prompt instead of the default selection prompt", async () => {
  const session = new BbsUiSession(createFakeDb());

  await session.handleHello({ user: "kei" });
  expectScreen(await session.handleEvent(""));
  expectScreen(await session.handleEvent("1"));
  const titleScreen = expectScreen(await session.handleEvent("W"));

  assert.equal(titleScreen.prompt, "Enter title (0 to cancel): ");
  assert.ok(!titleScreen.lines.includes("Enter title (0 to cancel):"));
});

test("write body screen renders a single separator line", async () => {
  const session = new BbsUiSession(createFakeDb());

  await session.handleHello({ user: "kei" });
  expectScreen(await session.handleEvent(""));
  expectScreen(await session.handleEvent("1"));
  expectScreen(await session.handleEvent("W"));
  const bodyScreen = expectScreen(await session.handleEvent("title"));

  assert.equal(bodyScreen.lines.filter((line) => /^-+$/.test(line)).length, 1);
  assert.equal(bodyScreen.prompt, "");
});

test("welcome body line input is accepted without returning a new screen", async () => {
  let updatedBody: string | null = null;
  const session = new BbsUiSession(
    createFakeDb({
      updateConferenceWelcome: async ({ body }) => {
        updatedBody = body;
      },
      getConference: async (conferenceId: string) =>
        conferenceId === rootConference.id
          ? { ...rootConference, welcomeTitle: "Updated", welcomeBody: updatedBody ?? "" }
          : null,
    }),
  );

  await session.handleHello({ user: "kei" });
  expectScreen(await session.handleEvent("E"));
  expectScreen(await session.handleEvent("Updated"));

  const accepted = await session.handleEvent("line 1");
  assert.deepEqual(accepted, { kind: "accepted" });

  const completed = expectScreen(await session.handleEvent("."));
  assert.ok(completed.toast?.includes("Welcome updated."));
  assert.equal(updatedBody, "line 1");
});
