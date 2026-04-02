import assert from "node:assert/strict";
import test from "node:test";
import type { AppContext } from "./app-context";
import { handleSessionEventRequest } from "./api";
import type { BbsDb } from "./db";
import type { Board, Conference, ConferenceMenuItem, Post, PostSummary } from "./domain";
import type { SessionEventResponse } from "./protocol";
import type { SessionData, SessionStore } from "./session-store";
import { BbsUiSession } from "./ui/session";

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
  throw new Error(`Unexpected call: ${name}`);
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
    createPost: async () => "post-2",
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

async function createStoredSession(
  db: BbsDb,
  setup: (session: BbsUiSession) => Promise<void>,
): Promise<{
  getAppContext: () => Promise<AppContext>;
  readState: () => SessionData;
}> {
  const uiSession = new BbsUiSession(db);
  await uiSession.handleHello({ user: "kei" });
  await setup(uiSession);

  let current: SessionData = {
    id: "session-1",
    nickname: "kei",
    term: { rows: 24, cols: 80 },
    state: uiSession.serialize(),
    createdAtMs: 0,
    lastActiveAtMs: 0,
    version: 1,
  };

  const sessionStore: SessionStore = {
    get: async () => current,
    create: async () => unexpected("create"),
    update: async ({ sessionId, term, state, expectedVersion }) => {
      assert.equal(sessionId, "session-1");
      assert.equal(expectedVersion, current.version);
      current = {
        ...current,
        term: term ?? current.term,
        state,
        version: current.version + 1,
      };
      return current;
    },
    delete: async () => true,
  };

  return {
    getAppContext: async () => ({
      db,
      sessionStore,
      sessionTtlMs: 60_000,
    }),
    readState: () => current,
  };
}

test("session event API returns screen for line-mode transitions", async () => {
  const db = createFakeDb();
  const ctx = await createStoredSession(db, async (session) => {
    expectScreen(await session.handleEvent(""));
    expectScreen(await session.handleEvent("1"));
  });

  const result = await handleSessionEventRequest(
    "session-1",
    { input: "W" },
    { getAppContext: ctx.getAppContext },
  );

  assert.equal(result.kind, "screen");
  assert.ok(result.screen.lines.includes("Enter title (0 to cancel):"));
});

test("session event API returns accepted for multiline body input", async () => {
  const db = createFakeDb();
  const ctx = await createStoredSession(db, async (session) => {
    expectScreen(await session.handleEvent(""));
    expectScreen(await session.handleEvent("1"));
    expectScreen(await session.handleEvent("W"));
    expectScreen(await session.handleEvent("title"));
  });

  const result = await handleSessionEventRequest(
    "session-1",
    { input: "body line" },
    { getAppContext: ctx.getAppContext },
  );

  assert.deepEqual(result, { kind: "accepted" });
  assert.equal((ctx.readState().state.mode as { kind: string }).kind, "writeBody");
  assert.deepEqual(
    (ctx.readState().state.mode as { lines: string[] }).lines,
    ["body line"],
  );
});
