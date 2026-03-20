import crypto from "node:crypto";
import type {
  Board,
  Conference,
  ConferenceMenuItem,
  Post,
  PostSummary,
} from "./domain";
import type { DbConfig } from "./config";
import {
  createDsqlPool,
  ensureDsqlSchema,
  qualifyName,
  type DsqlClient,
  type DsqlPool,
  withDsqlTransaction,
} from "./dsql";

export type PostsPage = { posts: PostSummary[]; nextCursor: string | null };

export type ListPostsInput = {
  conferenceId: string;
  boardId: string;
  pageSize: number;
  cursor?: string | null;
};

export interface BbsDb {
  listConferences(): Promise<Conference[]>;
  getConference(conferenceId: string): Promise<Conference | null>;
  getRootConference(): Promise<Conference | null>;
  updateConferenceWelcome(args: {
    conferenceId: string;
    title: string;
    body: string;
    updatedBy: string;
  }): Promise<void>;
  updateConferenceMenu(args: {
    conferenceId: string;
    title: string;
    body: string;
    updatedBy: string;
  }): Promise<void>;
  createConference(args: { name: string; updatedBy: string }): Promise<string>;
  renameConference(args: {
    conferenceId: string;
    name: string;
    updatedBy: string;
  }): Promise<boolean>;
  deleteConference(args: { conferenceId: string }): Promise<boolean>;

  listMenuItems(conferenceId: string): Promise<ConferenceMenuItem[]>;
  getMenuItem(args: {
    conferenceId: string;
    menuItemId: string;
  }): Promise<ConferenceMenuItem | null>;
  createMenuItem(args: {
    conferenceId: string;
    label: string;
    displayNo: string;
    displayType: string;
    actionType: ConferenceMenuItem["actionType"];
    actionRef: string;
    body: string;
    hidden: boolean;
    updatedBy: string;
  }): Promise<string>;
  deleteMenuItem(args: {
    conferenceId: string;
    menuItemId: string;
  }): Promise<boolean>;
  setMenuItemHidden(args: {
    conferenceId: string;
    menuItemId: string;
    hidden: boolean;
    updatedBy: string;
  }): Promise<boolean>;
  updateMenuItemMeta(args: {
    conferenceId: string;
    menuItemId: string;
    label: string;
    displayNo: string;
    displayType: string;
    updatedBy: string;
  }): Promise<boolean>;
  updateMenuItemContent(args: {
    conferenceId: string;
    menuItemId: string;
    actionRef: string;
    body: string;
    updatedBy: string;
  }): Promise<boolean>;
  getBoard(conferenceId: string, boardId: string): Promise<Board | null>;
  listBoards(conferenceId: string): Promise<Board[]>;
  createBoard(args: { conferenceId: string; name: string }): Promise<string>;
  renameBoard(args: {
    conferenceId: string;
    boardId: string;
    name: string;
  }): Promise<boolean>;
  deleteBoard(args: {
    conferenceId: string;
    boardId: string;
  }): Promise<boolean>;

  listPosts(args: ListPostsInput): Promise<PostsPage>;
  getPost(postId: string): Promise<Post | null>;
  createPost(args: {
    conferenceId: string;
    boardId: string;
    title: string;
    body: string;
    author: string;
  }): Promise<string>;

  close(): Promise<void>;

  getPool(): DsqlPool;
  getSchemaName(): string;
}

type TimestampValue = string | Date;

type ConferenceRow = {
  conference_id: string;
  slug: string | null;
  name: string;
  is_root: boolean;
  welcome_title: string;
  welcome_body: string;
  menu_title: string;
  menu_body: string;
  updated_at: TimestampValue;
  updated_by: string;
};

type MenuItemRow = {
  menu_item_id: string;
  conference_id: string;
  label: string;
  display_no: string;
  display_type: string;
  action_type: ConferenceMenuItem["actionType"];
  action_ref: string;
  body: string;
  hidden: boolean;
  updated_at: TimestampValue;
  updated_by: string;
};

type BoardRow = {
  board_id: string;
  conference_id: string;
  name: string;
};

type PostRow = {
  post_id: string;
  conference_id: string;
  board_id: string;
  title: string;
  body: string;
  author: string;
  created_at: TimestampValue;
};

type PostCursor = {
  createdAt: string;
  postId: string;
};

const ROOT_CONFERENCE_ID = "0";
const DEFAULT_CONFERENCE_ID = "main";
const DEFAULT_BOARD_ID = "general";
const DEFAULT_ROOT_MENU_ITEM_ID = "root-main";
const DEFAULT_MAIN_MENU_ITEM_ID = "main-general";

export async function createBbsDb(
  config: DbConfig,
  pool?: DsqlPool,
): Promise<BbsDb> {
  return new DsqlBbsDb(config.dsql, pool);
}

export async function ensureBbsSeedData(
  pool: DsqlPool,
  schemaName: string,
): Promise<void> {
  await seedDefaults(pool, schemaName);
}

export async function setupBbsDb(config: DbConfig): Promise<void> {
  const pool = createDsqlPool(config.dsql);
  try {
    await ensureDsqlSchema(pool, config.dsql.schema);
    await ensureBbsSeedData(pool, config.dsql.schema);
  } finally {
    await pool.end();
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return crypto.randomUUID();
}

function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function decodeCursor(
  cursor: string | null | undefined,
): Record<string, unknown> | null {
  if (!cursor) return null;
  try {
    const text = Buffer.from(cursor, "base64").toString("utf8");
    const data = JSON.parse(text);
    if (data && typeof data === "object") {
      return data as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function parsePostCursor(cursor: string | null | undefined): PostCursor | null {
  const decoded = decodeCursor(cursor);
  if (!decoded) return null;
  if (
    typeof decoded.createdAt === "string" &&
    typeof decoded.postId === "string"
  ) {
    return {
      createdAt: decoded.createdAt,
      postId: decoded.postId,
    };
  }
  return null;
}

function toIso(value: TimestampValue): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapConferenceRow(row: ConferenceRow): Conference {
  return {
    id: row.conference_id,
    slug: row.slug,
    name: row.name,
    isRoot: row.is_root,
    welcomeTitle: row.welcome_title,
    welcomeBody: row.welcome_body,
    menuTitle: row.menu_title,
    menuBody: row.menu_body,
    updatedAt: toIso(row.updated_at),
    updatedBy: row.updated_by,
  };
}

function mapMenuItemRow(row: MenuItemRow): ConferenceMenuItem {
  return {
    id: row.menu_item_id,
    conferenceId: row.conference_id,
    label: row.label,
    displayNo: row.display_no,
    displayType: row.display_type,
    actionType: row.action_type,
    actionRef: row.action_ref,
    body: row.body,
    hidden: row.hidden,
    updatedAt: toIso(row.updated_at),
    updatedBy: row.updated_by,
  };
}

function mapBoardRow(row: BoardRow): Board {
  return {
    id: row.board_id,
    conferenceId: row.conference_id,
    name: row.name,
  };
}

function mapPostSummaryRow(row: PostRow): PostSummary {
  return {
    id: row.post_id,
    title: row.title,
    author: row.author,
    createdAt: toIso(row.created_at),
  };
}

function mapPostRow(row: PostRow): Post {
  return {
    id: row.post_id,
    conferenceId: row.conference_id,
    boardId: row.board_id,
    title: row.title,
    body: row.body,
    author: row.author,
    createdAt: toIso(row.created_at),
  };
}

async function seedDefaults(pool: DsqlPool, schemaName: string): Promise<void> {
  const table = (name: string): string => qualifyName(schemaName, name);
  const now = nowIso();

  await pool.query(
    `
      INSERT INTO ${table("conferences")} (
        conference_id,
        slug,
        name,
        is_root,
        welcome_title,
        welcome_body,
        menu_title,
        menu_body,
        created_at,
        updated_at,
        updated_by
      )
      VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7, $8, $8, $9)
      ON CONFLICT (conference_id) DO NOTHING
    `,
    [
      ROOT_CONFERENCE_ID,
      "root",
      "Lobby",
      "Welcome",
      "",
      "Menu",
      "",
      now,
      "system",
    ],
  );

  await pool.query(
    `
      INSERT INTO ${table("conferences")} (
        conference_id,
        slug,
        name,
        is_root,
        welcome_title,
        welcome_body,
        menu_title,
        menu_body,
        created_at,
        updated_at,
        updated_by
      )
      VALUES ($1, $2, $3, FALSE, $4, $5, $6, $7, $8, $8, $9)
      ON CONFLICT (conference_id) DO NOTHING
    `,
    [
      DEFAULT_CONFERENCE_ID,
      "main",
      "Main",
      "Welcome",
      "",
      "Menu",
      "",
      now,
      "system",
    ],
  );

  const boardExists = await pool.query<{ board_id: string }>(
    `
      SELECT board_id
      FROM ${table("boards")}
      WHERE conference_id = $1
      LIMIT 1
    `,
    [DEFAULT_CONFERENCE_ID],
  );

  if ((boardExists.rowCount ?? 0) === 0) {
    await pool.query(
      `
        INSERT INTO ${table("boards")} (
          board_id,
          conference_id,
          name,
          created_at
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (board_id) DO NOTHING
      `,
      [DEFAULT_BOARD_ID, DEFAULT_CONFERENCE_ID, "General", now],
    );
  }

  const mainMenuExists = await pool.query<{ menu_item_id: string }>(
    `
      SELECT menu_item_id
      FROM ${table("menu_items")}
      WHERE conference_id = $1
      LIMIT 1
    `,
    [DEFAULT_CONFERENCE_ID],
  );

  if ((mainMenuExists.rowCount ?? 0) === 0) {
    await pool.query(
      `
        INSERT INTO ${table("menu_items")} (
          menu_item_id,
          conference_id,
          label,
          display_no,
          display_type,
          action_type,
          action_ref,
          body,
          hidden,
          created_at,
          updated_at,
          updated_by
        )
        VALUES ($1, $2, $3, '', '', 'board', $4, '', FALSE, $5, $5, $6)
        ON CONFLICT (menu_item_id) DO NOTHING
      `,
      [
        DEFAULT_MAIN_MENU_ITEM_ID,
        DEFAULT_CONFERENCE_ID,
        "General",
        DEFAULT_BOARD_ID,
        now,
        "system",
      ],
    );
  }

  const rootMenuExists = await pool.query<{ menu_item_id: string }>(
    `
      SELECT menu_item_id
      FROM ${table("menu_items")}
      WHERE conference_id = $1
      LIMIT 1
    `,
    [ROOT_CONFERENCE_ID],
  );

  if ((rootMenuExists.rowCount ?? 0) === 0) {
    await pool.query(
      `
        INSERT INTO ${table("menu_items")} (
          menu_item_id,
          conference_id,
          label,
          display_no,
          display_type,
          action_type,
          action_ref,
          body,
          hidden,
          created_at,
          updated_at,
          updated_by
        )
        VALUES ($1, $2, $3, '', '', 'conference', $4, '', FALSE, $5, $5, $6)
        ON CONFLICT (menu_item_id) DO NOTHING
      `,
      [
        DEFAULT_ROOT_MENU_ITEM_ID,
        ROOT_CONFERENCE_ID,
        "Main",
        DEFAULT_CONFERENCE_ID,
        now,
        "system",
      ],
    );
  }
}

class DsqlBbsDb implements BbsDb {
  private readonly pool: DsqlPool;
  private readonly schemaName: string;

  constructor(config: DbConfig["dsql"], pool?: DsqlPool) {
    this.pool = pool ?? createDsqlPool(config);
    this.schemaName = config.schema;
  }

  private table(name: string): string {
    return qualifyName(this.schemaName, name);
  }

  async seedDefaults(): Promise<void> {
    await seedDefaults(this.pool, this.schemaName);
  }

  async listConferences(): Promise<Conference[]> {
    const result = await this.pool.query<ConferenceRow>(
      `
        SELECT
          conference_id,
          slug,
          name,
          is_root,
          welcome_title,
          welcome_body,
          menu_title,
          menu_body,
          updated_at,
          updated_by
        FROM ${this.table("conferences")}
        WHERE is_root = FALSE
        ORDER BY created_at ASC, conference_id ASC
      `,
    );
    return result.rows.map(mapConferenceRow);
  }

  async getConference(conferenceId: string): Promise<Conference | null> {
    const result = await this.pool.query<ConferenceRow>(
      `
        SELECT
          conference_id,
          slug,
          name,
          is_root,
          welcome_title,
          welcome_body,
          menu_title,
          menu_body,
          updated_at,
          updated_by
        FROM ${this.table("conferences")}
        WHERE conference_id = $1
        LIMIT 1
      `,
      [conferenceId],
    );
    const row = result.rows[0];
    return row ? mapConferenceRow(row) : null;
  }

  async getRootConference(): Promise<Conference | null> {
    return this.getConference(ROOT_CONFERENCE_ID);
  }

  async updateConferenceWelcome(args: {
    conferenceId: string;
    title: string;
    body: string;
    updatedBy: string;
  }): Promise<void> {
    await this.pool.query(
      `
        UPDATE ${this.table("conferences")}
        SET
          welcome_title = $2,
          welcome_body = $3,
          updated_at = $4,
          updated_by = $5
        WHERE conference_id = $1
      `,
      [args.conferenceId, args.title, args.body, nowIso(), args.updatedBy],
    );
  }

  async updateConferenceMenu(args: {
    conferenceId: string;
    title: string;
    body: string;
    updatedBy: string;
  }): Promise<void> {
    await this.pool.query(
      `
        UPDATE ${this.table("conferences")}
        SET
          menu_title = $2,
          menu_body = $3,
          updated_at = $4,
          updated_by = $5
        WHERE conference_id = $1
      `,
      [args.conferenceId, args.title, args.body, nowIso(), args.updatedBy],
    );
  }

  async createConference(args: {
    name: string;
    updatedBy: string;
  }): Promise<string> {
    const id = generateId();
    const now = nowIso();

    await this.pool.query(
      `
        INSERT INTO ${this.table("conferences")} (
          conference_id,
          slug,
          name,
          is_root,
          welcome_title,
          welcome_body,
          menu_title,
          menu_body,
          created_at,
          updated_at,
          updated_by
        )
        VALUES ($1, NULL, $2, FALSE, 'Welcome', '', 'Menu', '', $3, $3, $4)
      `,
      [id, args.name, now, args.updatedBy],
    );

    return id;
  }

  async renameConference(args: {
    conferenceId: string;
    name: string;
    updatedBy: string;
  }): Promise<boolean> {
    const result = await this.pool.query<{ conference_id: string }>(
      `
        UPDATE ${this.table("conferences")}
        SET
          name = $2,
          updated_at = $3,
          updated_by = $4
        WHERE conference_id = $1
          AND is_root = FALSE
        RETURNING conference_id
      `,
      [args.conferenceId, args.name, nowIso(), args.updatedBy],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteConference(args: { conferenceId: string }): Promise<boolean> {
    return withDsqlTransaction(this.pool, async (client) => {
      const conference = await client.query<{ is_root: boolean }>(
        `
          SELECT is_root
          FROM ${this.table("conferences")}
          WHERE conference_id = $1
          LIMIT 1
        `,
        [args.conferenceId],
      );

      const row = conference.rows[0];
      if (!row || row.is_root) return false;

      await client.query(
        `
          DELETE FROM ${this.table("menu_items")}
          WHERE conference_id = $1
             OR (action_type = 'conference' AND action_ref = $1)
        `,
        [args.conferenceId],
      );

      const boards = await client.query<{ board_id: string }>(
        `
          SELECT board_id
          FROM ${this.table("boards")}
          WHERE conference_id = $1
        `,
        [args.conferenceId],
      );

      for (const board of boards.rows) {
        await client.query(
          `
            DELETE FROM ${this.table("posts")}
            WHERE board_id = $1
              AND conference_id = $2
          `,
          [board.board_id, args.conferenceId],
        );
      }

      await client.query(
        `
          DELETE FROM ${this.table("boards")}
          WHERE conference_id = $1
        `,
        [args.conferenceId],
      );

      const deleted = await client.query<{ conference_id: string }>(
        `
          DELETE FROM ${this.table("conferences")}
          WHERE conference_id = $1
          RETURNING conference_id
        `,
        [args.conferenceId],
      );

      return (deleted.rowCount ?? 0) > 0;
    });
  }

  async listMenuItems(conferenceId: string): Promise<ConferenceMenuItem[]> {
    const result = await this.pool.query<MenuItemRow>(
      `
        SELECT
          menu_item_id,
          conference_id,
          label,
          display_no,
          display_type,
          action_type,
          action_ref,
          body,
          hidden,
          updated_at,
          updated_by
        FROM ${this.table("menu_items")}
        WHERE conference_id = $1
        ORDER BY created_at ASC, menu_item_id ASC
      `,
      [conferenceId],
    );

    return result.rows.map(mapMenuItemRow);
  }

  async getMenuItem(args: {
    conferenceId: string;
    menuItemId: string;
  }): Promise<ConferenceMenuItem | null> {
    const result = await this.pool.query<MenuItemRow>(
      `
        SELECT
          menu_item_id,
          conference_id,
          label,
          display_no,
          display_type,
          action_type,
          action_ref,
          body,
          hidden,
          updated_at,
          updated_by
        FROM ${this.table("menu_items")}
        WHERE conference_id = $1
          AND menu_item_id = $2
        LIMIT 1
      `,
      [args.conferenceId, args.menuItemId],
    );

    const row = result.rows[0];
    return row ? mapMenuItemRow(row) : null;
  }

  async createMenuItem(args: {
    conferenceId: string;
    label: string;
    displayNo: string;
    displayType: string;
    actionType: ConferenceMenuItem["actionType"];
    actionRef: string;
    body: string;
    hidden: boolean;
    updatedBy: string;
  }): Promise<string> {
    const id = generateId();
    const now = nowIso();

    await this.pool.query(
      `
        INSERT INTO ${this.table("menu_items")} (
          menu_item_id,
          conference_id,
          label,
          display_no,
          display_type,
          action_type,
          action_ref,
          body,
          hidden,
          created_at,
          updated_at,
          updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11)
      `,
      [
        id,
        args.conferenceId,
        args.label,
        args.displayNo,
        args.displayType,
        args.actionType,
        args.actionRef,
        args.body,
        args.hidden,
        now,
        args.updatedBy,
      ],
    );

    return id;
  }

  async deleteMenuItem(args: {
    conferenceId: string;
    menuItemId: string;
  }): Promise<boolean> {
    const result = await this.pool.query<{ menu_item_id: string }>(
      `
        DELETE FROM ${this.table("menu_items")}
        WHERE conference_id = $1
          AND menu_item_id = $2
        RETURNING menu_item_id
      `,
      [args.conferenceId, args.menuItemId],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async setMenuItemHidden(args: {
    conferenceId: string;
    menuItemId: string;
    hidden: boolean;
    updatedBy: string;
  }): Promise<boolean> {
    const result = await this.pool.query<{ menu_item_id: string }>(
      `
        UPDATE ${this.table("menu_items")}
        SET
          hidden = $3,
          updated_at = $4,
          updated_by = $5
        WHERE conference_id = $1
          AND menu_item_id = $2
        RETURNING menu_item_id
      `,
      [
        args.conferenceId,
        args.menuItemId,
        args.hidden,
        nowIso(),
        args.updatedBy,
      ],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async updateMenuItemMeta(args: {
    conferenceId: string;
    menuItemId: string;
    label: string;
    displayNo: string;
    displayType: string;
    updatedBy: string;
  }): Promise<boolean> {
    const result = await this.pool.query<{ menu_item_id: string }>(
      `
        UPDATE ${this.table("menu_items")}
        SET
          label = $3,
          display_no = $4,
          display_type = $5,
          updated_at = $6,
          updated_by = $7
        WHERE conference_id = $1
          AND menu_item_id = $2
        RETURNING menu_item_id
      `,
      [
        args.conferenceId,
        args.menuItemId,
        args.label,
        args.displayNo,
        args.displayType,
        nowIso(),
        args.updatedBy,
      ],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async updateMenuItemContent(args: {
    conferenceId: string;
    menuItemId: string;
    actionRef: string;
    body: string;
    updatedBy: string;
  }): Promise<boolean> {
    const result = await this.pool.query<{ menu_item_id: string }>(
      `
        UPDATE ${this.table("menu_items")}
        SET
          action_ref = $3,
          body = $4,
          updated_at = $5,
          updated_by = $6
        WHERE conference_id = $1
          AND menu_item_id = $2
        RETURNING menu_item_id
      `,
      [
        args.conferenceId,
        args.menuItemId,
        args.actionRef,
        args.body,
        nowIso(),
        args.updatedBy,
      ],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async getBoard(conferenceId: string, boardId: string): Promise<Board | null> {
    const result = await this.pool.query<BoardRow>(
      `
        SELECT board_id, conference_id, name
        FROM ${this.table("boards")}
        WHERE conference_id = $1
          AND board_id = $2
        LIMIT 1
      `,
      [conferenceId, boardId],
    );

    const row = result.rows[0];
    return row ? mapBoardRow(row) : null;
  }

  async listBoards(conferenceId: string): Promise<Board[]> {
    const result = await this.pool.query<BoardRow>(
      `
        SELECT board_id, conference_id, name
        FROM ${this.table("boards")}
        WHERE conference_id = $1
        ORDER BY created_at ASC, board_id ASC
      `,
      [conferenceId],
    );

    return result.rows.map(mapBoardRow);
  }

  async createBoard(args: {
    conferenceId: string;
    name: string;
  }): Promise<string> {
    const id = generateId();

    await this.pool.query(
      `
        INSERT INTO ${this.table("boards")} (
          board_id,
          conference_id,
          name,
          created_at
        )
        VALUES ($1, $2, $3, $4)
      `,
      [id, args.conferenceId, args.name, nowIso()],
    );

    return id;
  }

  async renameBoard(args: {
    conferenceId: string;
    boardId: string;
    name: string;
  }): Promise<boolean> {
    const result = await this.pool.query<{ board_id: string }>(
      `
        UPDATE ${this.table("boards")}
        SET name = $3
        WHERE conference_id = $1
          AND board_id = $2
        RETURNING board_id
      `,
      [args.conferenceId, args.boardId, args.name],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async deleteBoard(args: {
    conferenceId: string;
    boardId: string;
  }): Promise<boolean> {
    return withDsqlTransaction(this.pool, async (client) => {
      const board = await client.query<{ board_id: string }>(
        `
          SELECT board_id
          FROM ${this.table("boards")}
          WHERE conference_id = $1
            AND board_id = $2
          LIMIT 1
        `,
        [args.conferenceId, args.boardId],
      );

      if ((board.rowCount ?? 0) === 0) return false;

      await client.query(
        `
          DELETE FROM ${this.table("posts")}
          WHERE conference_id = $1
            AND board_id = $2
        `,
        [args.conferenceId, args.boardId],
      );

      const deleted = await client.query<{ board_id: string }>(
        `
          DELETE FROM ${this.table("boards")}
          WHERE conference_id = $1
            AND board_id = $2
          RETURNING board_id
        `,
        [args.conferenceId, args.boardId],
      );

      return (deleted.rowCount ?? 0) > 0;
    });
  }

  async listPosts(args: ListPostsInput): Promise<PostsPage> {
    const pageSize = Math.max(1, Math.trunc(args.pageSize));
    const cursor = parsePostCursor(args.cursor);

    let sql = `
      SELECT
        post_id,
        conference_id,
        board_id,
        title,
        body,
        author,
        created_at
      FROM ${this.table("posts")}
      WHERE board_id = $1
        AND conference_id = $2
    `;
    let values: unknown[] = [args.boardId, args.conferenceId, pageSize + 1];

    if (cursor) {
      sql += `
        AND (created_at, post_id) < ($3::timestamptz, $4::text)
      `;
      values = [
        args.boardId,
        args.conferenceId,
        cursor.createdAt,
        cursor.postId,
        pageSize + 1,
      ];
    }

    sql += `
      ORDER BY created_at DESC, post_id DESC
      LIMIT $${values.length}
    `;

    const result = await this.pool.query<PostRow>(sql, values);
    const rows = result.rows;
    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
    const lastRow = pageRows[pageRows.length - 1];

    return {
      posts: pageRows.map(mapPostSummaryRow),
      nextCursor:
        hasMore && lastRow
          ? encodeCursor({
              createdAt: toIso(lastRow.created_at),
              postId: lastRow.post_id,
            })
          : null,
    };
  }

  async getPost(postId: string): Promise<Post | null> {
    const result = await this.pool.query<PostRow>(
      `
        SELECT
          post_id,
          conference_id,
          board_id,
          title,
          body,
          author,
          created_at
        FROM ${this.table("posts")}
        WHERE post_id = $1
        LIMIT 1
      `,
      [postId],
    );

    const row = result.rows[0];
    return row ? mapPostRow(row) : null;
  }

  async createPost(args: {
    conferenceId: string;
    boardId: string;
    title: string;
    body: string;
    author: string;
  }): Promise<string> {
    const id = generateId();

    await this.pool.query(
      `
        INSERT INTO ${this.table("posts")} (
          post_id,
          conference_id,
          board_id,
          title,
          body,
          author,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        id,
        args.conferenceId,
        args.boardId,
        args.title,
        args.body,
        args.author,
        nowIso(),
      ],
    );

    return id;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  getPool(): DsqlPool {
    return this.pool;
  }

  getSchemaName(): string {
    return this.schemaName;
  }
}
