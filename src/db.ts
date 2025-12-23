import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";
import type { Board, Conference, ConferenceMenuItem, Post, PostSummary } from "./domain";

type DbConferenceRow = {
  id: number;
  slug: string | null;
  name: string;
  sort_order: number;
  is_root: number;
  welcome_title: string;
  welcome_body: string;
  menu_title: string;
  menu_body: string;
  updated_at: string;
  updated_by: string;
};

type DbMenuItemRow = {
  id: number;
  conference_id: number;
  label: string;
  display_no: string;
  display_type: string;
  action_type: string;
  action_ref: string;
  body: string;
  sort_order: number;
  hidden: number;
  updated_at: string;
  updated_by: string;
};

type DbBoardRow = { id: number; name: string; sort_order: number; conference_id: number | null };
type DbPostSummaryRow = { id: number; title: string; author: string; created_at: string };
type DbPostRow = {
  id: number;
  board_id: number;
  title: string;
  body: string;
  author: string;
  created_at: string;
};

export class BbsDb {
  private readonly db: DatabaseSync;

  private readonly insertConferenceStmt: StatementSync;
  private readonly getConferenceStmt: StatementSync;
  private readonly getRootConferenceStmt: StatementSync;
  private readonly listConferencesStmt: StatementSync;
  private readonly getDefaultConferenceStmt: StatementSync;
  private readonly getMaxConferenceSortOrderStmt: StatementSync;
  private readonly updateConferenceWelcomeStmt: StatementSync;
  private readonly updateConferenceMenuStmt: StatementSync;
  private readonly updateConferenceNameStmt: StatementSync;
  private readonly deleteConferenceStmt: StatementSync;

  private readonly countMenuItemsStmt: StatementSync;
  private readonly listMenuItemsStmt: StatementSync;
  private readonly getMenuItemStmt: StatementSync;
  private readonly insertMenuItemStmt: StatementSync;
  private readonly deleteMenuItemStmt: StatementSync;
  private readonly updateMenuItemHiddenStmt: StatementSync;
  private readonly updateMenuItemMetaStmt: StatementSync;
  private readonly updateMenuItemContentStmt: StatementSync;
  private readonly updateMenuItemSortOrderStmt: StatementSync;
  private readonly deleteMenuItemsByConferenceStmt: StatementSync;

  private readonly countBoardsByConferenceStmt: StatementSync;
  private readonly getMaxBoardSortOrderStmt: StatementSync;
  private readonly insertBoardStmt: StatementSync;
  private readonly getBoardStmt: StatementSync;
  private readonly listBoardsByConferenceStmt: StatementSync;
  private readonly updateBoardsConferenceStmt: StatementSync;
  private readonly updateBoardNameStmt: StatementSync;
  private readonly deleteBoardStmt: StatementSync;
  private readonly deleteBoardsByConferenceStmt: StatementSync;

  private readonly listPostsStmt: StatementSync;
  private readonly getPostStmt: StatementSync;
  private readonly insertPostStmt: StatementSync;
  private readonly deletePostsByBoardStmt: StatementSync;
  private readonly deletePostsByConferenceStmt: StatementSync;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);

    this.migrate();

    this.insertConferenceStmt = this.db.prepare(
      "INSERT INTO conferences (slug, name, sort_order, is_root, welcome_title, welcome_body, menu_title, menu_body, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    this.getConferenceStmt = this.db.prepare(
      "SELECT id, slug, name, sort_order, is_root, welcome_title, welcome_body, menu_title, menu_body, updated_at, updated_by FROM conferences WHERE id = ?",
    );
    this.getRootConferenceStmt = this.db.prepare(
      "SELECT id, slug, name, sort_order, is_root, welcome_title, welcome_body, menu_title, menu_body, updated_at, updated_by FROM conferences WHERE is_root = 1 ORDER BY id ASC LIMIT 1",
    );
    this.listConferencesStmt = this.db.prepare(
      "SELECT id, slug, name, sort_order, is_root, welcome_title, welcome_body, menu_title, menu_body, updated_at, updated_by FROM conferences WHERE is_root = 0 ORDER BY sort_order ASC, id ASC",
    );
    this.getDefaultConferenceStmt = this.db.prepare(
      "SELECT id, slug, name, sort_order, is_root, welcome_title, welcome_body, menu_title, menu_body, updated_at, updated_by FROM conferences WHERE is_root = 0 ORDER BY sort_order ASC, id ASC LIMIT 1",
    );
    this.getMaxConferenceSortOrderStmt = this.db.prepare(
      "SELECT MAX(sort_order) AS max_sort FROM conferences WHERE is_root = 0",
    );
    this.updateConferenceWelcomeStmt = this.db.prepare(
      "UPDATE conferences SET welcome_title = ?, welcome_body = ?, updated_at = ?, updated_by = ? WHERE id = ?",
    );
    this.updateConferenceMenuStmt = this.db.prepare(
      "UPDATE conferences SET menu_title = ?, menu_body = ?, updated_at = ?, updated_by = ? WHERE id = ?",
    );
    this.updateConferenceNameStmt = this.db.prepare(
      "UPDATE conferences SET name = ?, updated_at = ?, updated_by = ? WHERE id = ? AND is_root = 0",
    );
    this.deleteConferenceStmt = this.db.prepare("DELETE FROM conferences WHERE id = ? AND is_root = 0");

    this.countMenuItemsStmt = this.db.prepare("SELECT COUNT(*) AS count FROM conference_menu_items WHERE conference_id = ?");
    this.listMenuItemsStmt = this.db.prepare(
      "SELECT id, conference_id, label, display_no, display_type, action_type, action_ref, body, sort_order, hidden, updated_at, updated_by FROM conference_menu_items WHERE conference_id = ? ORDER BY sort_order ASC, id ASC",
    );
    this.getMenuItemStmt = this.db.prepare(
      "SELECT id, conference_id, label, display_no, display_type, action_type, action_ref, body, sort_order, hidden, updated_at, updated_by FROM conference_menu_items WHERE id = ? AND conference_id = ?",
    );
    this.insertMenuItemStmt = this.db.prepare(
      "INSERT INTO conference_menu_items (conference_id, label, display_no, display_type, action_type, action_ref, body, sort_order, hidden, enabled, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    this.deleteMenuItemStmt = this.db.prepare("DELETE FROM conference_menu_items WHERE id = ? AND conference_id = ?");
    this.updateMenuItemHiddenStmt = this.db.prepare(
      "UPDATE conference_menu_items SET hidden = ?, enabled = ?, updated_at = ?, updated_by = ? WHERE id = ? AND conference_id = ?",
    );
    this.updateMenuItemMetaStmt = this.db.prepare(
      "UPDATE conference_menu_items SET label = ?, display_no = ?, display_type = ?, updated_at = ?, updated_by = ? WHERE id = ? AND conference_id = ?",
    );
    this.updateMenuItemContentStmt = this.db.prepare(
      "UPDATE conference_menu_items SET action_ref = ?, body = ?, updated_at = ?, updated_by = ? WHERE id = ? AND conference_id = ?",
    );
    this.updateMenuItemSortOrderStmt = this.db.prepare(
      "UPDATE conference_menu_items SET sort_order = ?, updated_at = ?, updated_by = ? WHERE id = ? AND conference_id = ?",
    );
    this.deleteMenuItemsByConferenceStmt = this.db.prepare("DELETE FROM conference_menu_items WHERE conference_id = ?");

    this.countBoardsByConferenceStmt = this.db.prepare("SELECT COUNT(*) AS count FROM boards WHERE conference_id = ?");
    this.getMaxBoardSortOrderStmt = this.db.prepare("SELECT MAX(sort_order) AS max_sort FROM boards WHERE conference_id = ?");
    this.insertBoardStmt = this.db.prepare("INSERT INTO boards (name, sort_order, conference_id) VALUES (?, ?, ?)");
    this.getBoardStmt = this.db.prepare("SELECT id, name, sort_order, conference_id FROM boards WHERE id = ?");
    this.listBoardsByConferenceStmt = this.db.prepare(
      "SELECT id, name, sort_order, conference_id FROM boards WHERE conference_id = ? ORDER BY sort_order ASC, id ASC",
    );
    this.updateBoardsConferenceStmt = this.db.prepare(
      "UPDATE boards SET conference_id = ? WHERE conference_id IS NULL OR conference_id = 0",
    );
    this.updateBoardNameStmt = this.db.prepare("UPDATE boards SET name = ? WHERE id = ? AND conference_id = ?");
    this.deleteBoardStmt = this.db.prepare("DELETE FROM boards WHERE id = ? AND conference_id = ?");
    this.deleteBoardsByConferenceStmt = this.db.prepare("DELETE FROM boards WHERE conference_id = ?");

    this.listPostsStmt = this.db.prepare(
      "SELECT id, title, author, created_at FROM posts WHERE board_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
    );
    this.getPostStmt = this.db.prepare(
      "SELECT id, board_id, title, body, author, created_at FROM posts WHERE id = ?",
    );
    this.insertPostStmt = this.db.prepare(
      "INSERT INTO posts (board_id, title, body, author, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    this.deletePostsByBoardStmt = this.db.prepare("DELETE FROM posts WHERE board_id = ?");
    this.deletePostsByConferenceStmt = this.db.prepare(
      "DELETE FROM posts WHERE board_id IN (SELECT id FROM boards WHERE conference_id = ?)",
    );

    this.seedDefaults();
  }

  private migrate() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS conferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_root INTEGER NOT NULL DEFAULT 0,
        welcome_title TEXT NOT NULL DEFAULT '',
        welcome_body TEXT NOT NULL DEFAULT '',
        menu_title TEXT NOT NULL DEFAULT '',
        menu_body TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conference_menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conference_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        display_no TEXT NOT NULL DEFAULT '',
        display_type TEXT NOT NULL DEFAULT '',
        action_type TEXT NOT NULL,
        action_ref TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        FOREIGN KEY(conference_id) REFERENCES conferences(id)
      );

      CREATE TABLE IF NOT EXISTS boards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        conference_id INTEGER
      );

      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        author TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(board_id) REFERENCES boards(id)
      );
    `);

    const boardColumns = this.db.prepare("PRAGMA table_info(boards)").all() as { name: string }[];
    const hasConferenceId = boardColumns.some((column) => column.name === "conference_id");
    if (!hasConferenceId) {
      this.db.exec("ALTER TABLE boards ADD COLUMN conference_id INTEGER");
    }

    const conferenceColumns = this.db.prepare("PRAGMA table_info(conferences)").all() as { name: string }[];
    const hasIsRoot = conferenceColumns.some((column) => column.name === "is_root");
    if (!hasIsRoot) {
      this.db.exec("ALTER TABLE conferences ADD COLUMN is_root INTEGER NOT NULL DEFAULT 0");
    }
    const hasMenuBody = conferenceColumns.some((column) => column.name === "menu_body");
    if (!hasMenuBody) {
      this.db.exec("ALTER TABLE conferences ADD COLUMN menu_body TEXT NOT NULL DEFAULT ''");
    }

    const menuColumns = this.db.prepare("PRAGMA table_info(conference_menu_items)").all() as { name: string }[];
    const hasDisplayNo = menuColumns.some((column) => column.name === "display_no");
    if (!hasDisplayNo) {
      this.db.exec("ALTER TABLE conference_menu_items ADD COLUMN display_no TEXT NOT NULL DEFAULT ''");
    }
    const hasDisplayType = menuColumns.some((column) => column.name === "display_type");
    if (!hasDisplayType) {
      this.db.exec("ALTER TABLE conference_menu_items ADD COLUMN display_type TEXT NOT NULL DEFAULT ''");
    }
    const hasHidden = menuColumns.some((column) => column.name === "hidden");
    if (!hasHidden) {
      this.db.exec("ALTER TABLE conference_menu_items ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
      this.db.exec("UPDATE conference_menu_items SET hidden = CASE WHEN enabled = 0 THEN 1 ELSE 0 END");
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_boards_conference_sort
      ON boards(conference_id, sort_order, id);

      CREATE INDEX IF NOT EXISTS idx_menu_items_conference_sort
      ON conference_menu_items(conference_id, sort_order, id);

      CREATE INDEX IF NOT EXISTS idx_posts_board_id_id_desc
      ON posts(board_id, id DESC);
    `);
  }

  private seedDefaults() {
    const now = new Date().toISOString();

    const rootRow = this.getRootConferenceStmt.get() as DbConferenceRow | undefined;
    let rootId = rootRow?.id;

    if (!rootId) {
      const result = this.insertConferenceStmt.run(
        "root",
        "Lobby",
        0,
        1,
        "Welcome",
        "",
        "Menu",
        "",
        now,
        "system",
      ) as { lastInsertRowid: number | bigint };
      rootId = Number(result.lastInsertRowid);
    }

    const defaultConferenceRow = this.getDefaultConferenceStmt.get() as DbConferenceRow | undefined;
    let conferenceId = defaultConferenceRow?.id;

    if (!conferenceId) {
      const result = this.insertConferenceStmt.run(
        "main",
        "Main",
        1,
        0,
        "Welcome",
        "",
        "Menu",
        "",
        now,
        "system",
      ) as { lastInsertRowid: number | bigint };
      conferenceId = Number(result.lastInsertRowid);
    }

    this.updateBoardsConferenceStmt.run(conferenceId);

    const boardCountRow = this.countBoardsByConferenceStmt.get(conferenceId) as { count: number } | undefined;
    const boardCount = boardCountRow?.count ?? 0;
    if (boardCount === 0) {
      this.insertBoardStmt.run("General", 1, conferenceId);
    }

    const menuCountRow = this.countMenuItemsStmt.get(conferenceId) as { count: number } | undefined;
    const menuCount = menuCountRow?.count ?? 0;
    if (menuCount === 0) {
      const boards = this.listBoards(conferenceId);
      let sortOrder = 1;
      for (const board of boards) {
        this.insertMenuItemStmt.run(
          conferenceId,
          board.name,
          "",
          "",
          "board",
          String(board.id),
          "",
          sortOrder,
          0,
          1,
          now,
          "system",
        );
        sortOrder += 1;
      }
    }

    if (rootId) {
      const rootMenuCountRow = this.countMenuItemsStmt.get(rootId) as { count: number } | undefined;
      const rootMenuCount = rootMenuCountRow?.count ?? 0;
      if (rootMenuCount === 0) {
        const conferences = this.listConferences();
        if (conferences.length > 0) {
          const first = conferences[0]!;
          this.insertMenuItemStmt.run(
            rootId,
            first.name,
            "",
            "",
            "conference",
            String(first.id),
            "",
            1,
            0,
            1,
            now,
            "system",
          );
        }
      }
    }
  }

  listConferences(): Conference[] {
    const rows = this.listConferencesStmt.all() as DbConferenceRow[];
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug ?? null,
      name: row.name,
      sortOrder: row.sort_order,
      isRoot: row.is_root === 1,
      welcomeTitle: row.welcome_title,
      welcomeBody: row.welcome_body,
      menuTitle: row.menu_title,
      menuBody: row.menu_body,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    }));
  }

  getConference(conferenceId: number): Conference | null {
    const row = this.getConferenceStmt.get(conferenceId) as DbConferenceRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug ?? null,
      name: row.name,
      sortOrder: row.sort_order,
      isRoot: row.is_root === 1,
      welcomeTitle: row.welcome_title,
      welcomeBody: row.welcome_body,
      menuTitle: row.menu_title,
      menuBody: row.menu_body,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  getRootConference(): Conference | null {
    const row = this.getRootConferenceStmt.get() as DbConferenceRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug ?? null,
      name: row.name,
      sortOrder: row.sort_order,
      isRoot: row.is_root === 1,
      welcomeTitle: row.welcome_title,
      welcomeBody: row.welcome_body,
      menuTitle: row.menu_title,
      menuBody: row.menu_body,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  updateConferenceWelcome(args: { conferenceId: number; title: string; body: string; updatedBy: string }): void {
    const updatedAt = new Date().toISOString();
    this.updateConferenceWelcomeStmt.run(args.title, args.body, updatedAt, args.updatedBy, args.conferenceId);
  }

  updateConferenceMenu(args: { conferenceId: number; title: string; body: string; updatedBy: string }): void {
    const updatedAt = new Date().toISOString();
    this.updateConferenceMenuStmt.run(args.title, args.body, updatedAt, args.updatedBy, args.conferenceId);
  }

  createConference(args: { name: string; updatedBy: string }): number {
    const updatedAt = new Date().toISOString();
    const row = this.getMaxConferenceSortOrderStmt.get() as { max_sort: number | null } | undefined;
    const nextSort = (row?.max_sort ?? 0) + 1;
    const result = this.insertConferenceStmt.run(
      null,
      args.name,
      nextSort,
      0,
      "Welcome",
      "",
      "Menu",
      "",
      updatedAt,
      args.updatedBy,
    ) as { lastInsertRowid: number | bigint };
    return Number(result.lastInsertRowid);
  }

  renameConference(args: { conferenceId: number; name: string; updatedBy: string }): boolean {
    const updatedAt = new Date().toISOString();
    const result = this.updateConferenceNameStmt.run(args.name, updatedAt, args.updatedBy, args.conferenceId) as {
      changes: number;
    };
    return result.changes > 0;
  }

  deleteConference(args: { conferenceId: number }): boolean {
    const conference = this.getConference(args.conferenceId);
    if (!conference || conference.isRoot) return false;
    this.db.exec("BEGIN");
    try {
      this.deleteMenuItemsByConferenceStmt.run(args.conferenceId);
      this.deletePostsByConferenceStmt.run(args.conferenceId);
      this.deleteBoardsByConferenceStmt.run(args.conferenceId);
      const result = this.deleteConferenceStmt.run(args.conferenceId) as { changes: number };
      this.db.exec("COMMIT");
      return result.changes > 0;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listMenuItems(conferenceId: number): ConferenceMenuItem[] {
    const rows = this.listMenuItemsStmt.all(conferenceId) as DbMenuItemRow[];
    return rows.map((row) => ({
      id: row.id,
      conferenceId: row.conference_id,
      label: row.label,
      displayNo: row.display_no,
      displayType: row.display_type,
      actionType: row.action_type as ConferenceMenuItem["actionType"],
      actionRef: row.action_ref,
      body: row.body,
      sortOrder: row.sort_order,
      hidden: Boolean(row.hidden),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    }));
  }

  getMenuItem(args: { conferenceId: number; menuItemId: number }): ConferenceMenuItem | null {
    const row = this.getMenuItemStmt.get(args.menuItemId, args.conferenceId) as DbMenuItemRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      conferenceId: row.conference_id,
      label: row.label,
      displayNo: row.display_no,
      displayType: row.display_type,
      actionType: row.action_type as ConferenceMenuItem["actionType"],
      actionRef: row.action_ref,
      body: row.body,
      sortOrder: row.sort_order,
      hidden: Boolean(row.hidden),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  createMenuItem(args: {
    conferenceId: number;
    label: string;
    displayNo: string;
    displayType: string;
    actionType: ConferenceMenuItem["actionType"];
    actionRef: string;
    body: string;
    sortOrder: number;
    hidden: boolean;
    updatedBy: string;
  }): number {
    const updatedAt = new Date().toISOString();
    const result = this.insertMenuItemStmt.run(
      args.conferenceId,
      args.label,
      args.displayNo,
      args.displayType,
      args.actionType,
      args.actionRef,
      args.body,
      args.sortOrder,
      args.hidden ? 1 : 0,
      args.hidden ? 0 : 1,
      updatedAt,
      args.updatedBy,
    ) as { lastInsertRowid: number | bigint };
    return Number(result.lastInsertRowid);
  }

  deleteMenuItem(args: { conferenceId: number; menuItemId: number }): boolean {
    const result = this.deleteMenuItemStmt.run(args.menuItemId, args.conferenceId) as { changes: number };
    return result.changes > 0;
  }

  setMenuItemHidden(args: { conferenceId: number; menuItemId: number; hidden: boolean; updatedBy: string }): boolean {
    const updatedAt = new Date().toISOString();
    const result = this.updateMenuItemHiddenStmt.run(
      args.hidden ? 1 : 0,
      args.hidden ? 0 : 1,
      updatedAt,
      args.updatedBy,
      args.menuItemId,
      args.conferenceId,
    ) as { changes: number };
    return result.changes > 0;
  }

  updateMenuItemMeta(args: {
    conferenceId: number;
    menuItemId: number;
    label: string;
    displayNo: string;
    displayType: string;
    updatedBy: string;
  }): boolean {
    const updatedAt = new Date().toISOString();
    const result = this.updateMenuItemMetaStmt.run(
      args.label,
      args.displayNo,
      args.displayType,
      updatedAt,
      args.updatedBy,
      args.menuItemId,
      args.conferenceId,
    ) as { changes: number };
    return result.changes > 0;
  }

  updateMenuItemContent(args: {
    conferenceId: number;
    menuItemId: number;
    actionRef: string;
    body: string;
    updatedBy: string;
  }): boolean {
    const updatedAt = new Date().toISOString();
    const result = this.updateMenuItemContentStmt.run(
      args.actionRef,
      args.body,
      updatedAt,
      args.updatedBy,
      args.menuItemId,
      args.conferenceId,
    ) as { changes: number };
    return result.changes > 0;
  }

  setMenuItemOrder(args: { conferenceId: number; orderedIds: number[]; updatedBy: string }): void {
    const updatedAt = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      args.orderedIds.forEach((id, index) => {
        this.updateMenuItemSortOrderStmt.run(index + 1, updatedAt, args.updatedBy, id, args.conferenceId);
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getBoard(boardId: number): Board | null {
    const row = this.getBoardStmt.get(boardId) as DbBoardRow | undefined;
    if (!row) return null;
    const conferenceId = typeof row.conference_id === "number" ? row.conference_id : 0;
    return { id: row.id, name: row.name, sortOrder: row.sort_order, conferenceId };
  }

  listBoards(conferenceId: number): Board[] {
    const rows = this.listBoardsByConferenceStmt.all(conferenceId) as DbBoardRow[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order,
      conferenceId: typeof row.conference_id === "number" ? row.conference_id : conferenceId,
    }));
  }

  createBoard(args: { conferenceId: number; name: string }): number {
    const row = this.getMaxBoardSortOrderStmt.get(args.conferenceId) as { max_sort: number | null } | undefined;
    const nextSort = (row?.max_sort ?? 0) + 1;
    const result = this.insertBoardStmt.run(args.name, nextSort, args.conferenceId) as {
      lastInsertRowid: number | bigint;
    };
    return Number(result.lastInsertRowid);
  }

  renameBoard(args: { conferenceId: number; boardId: number; name: string }): boolean {
    const result = this.updateBoardNameStmt.run(args.name, args.boardId, args.conferenceId) as { changes: number };
    return result.changes > 0;
  }

  deleteBoard(args: { conferenceId: number; boardId: number }): boolean {
    this.db.exec("BEGIN");
    try {
      this.deletePostsByBoardStmt.run(args.boardId);
      const result = this.deleteBoardStmt.run(args.boardId, args.conferenceId) as { changes: number };
      this.db.exec("COMMIT");
      return result.changes > 0;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listPosts(boardId: number, page: number, pageSize: number): PostSummary[] {
    const offset = (page - 1) * pageSize;
    const rows = this.listPostsStmt.all(boardId, pageSize, offset) as DbPostSummaryRow[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author,
      createdAt: row.created_at,
    }));
  }

  getPost(postId: number): Post | null {
    const row = this.getPostStmt.get(postId) as DbPostRow | undefined;
    if (!row) return null;

    return {
      id: row.id,
      boardId: row.board_id,
      title: row.title,
      body: row.body,
      author: row.author,
      createdAt: row.created_at,
    };
  }

  createPost(args: { boardId: number; title: string; body: string; author: string }): number {
    const createdAt = new Date().toISOString();
    const result = this.insertPostStmt.run(args.boardId, args.title, args.body, args.author, createdAt) as {
      lastInsertRowid: number | bigint;
    };
    return Number(result.lastInsertRowid);
  }

  close() {
    this.db.close();
  }
}
