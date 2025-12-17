import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";
import type { Board, Post, PostSummary } from "./domain";

type DbBoardRow = { id: number; name: string; sort_order: number };
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

  private readonly countBoardsStmt: StatementSync;
  private readonly insertBoardStmt: StatementSync;
  private readonly getBoardStmt: StatementSync;
  private readonly listBoardsStmt: StatementSync;

  private readonly listPostsStmt: StatementSync;
  private readonly getPostStmt: StatementSync;
  private readonly insertPostStmt: StatementSync;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);

    this.migrate();

    this.countBoardsStmt = this.db.prepare("SELECT COUNT(*) AS count FROM boards");
    this.insertBoardStmt = this.db.prepare("INSERT INTO boards (name, sort_order) VALUES (?, ?)");
    this.getBoardStmt = this.db.prepare("SELECT id, name, sort_order FROM boards WHERE id = ?");
    this.listBoardsStmt = this.db.prepare("SELECT id, name, sort_order FROM boards ORDER BY sort_order ASC, id ASC");

    this.listPostsStmt = this.db.prepare(
      "SELECT id, title, author, created_at FROM posts WHERE board_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
    );
    this.getPostStmt = this.db.prepare(
      "SELECT id, board_id, title, body, author, created_at FROM posts WHERE id = ?",
    );
    this.insertPostStmt = this.db.prepare(
      "INSERT INTO posts (board_id, title, body, author, created_at) VALUES (?, ?, ?, ?, ?)",
    );

    this.seedDefaultBoards();
  }

  private migrate() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS boards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
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

      CREATE INDEX IF NOT EXISTS idx_posts_board_id_id_desc
      ON posts(board_id, id DESC);
    `);
  }

  private seedDefaultBoards() {
    const row = this.countBoardsStmt.get() as { count: number } | undefined;
    const count = row?.count ?? 0;
    if (count > 0) return;

    this.insertBoardStmt.run("General", 1);
  }

  getBoard(boardId: number): Board | null {
    const row = this.getBoardStmt.get(boardId) as DbBoardRow | undefined;
    if (!row) return null;

    return { id: row.id, name: row.name, sortOrder: row.sort_order };
  }

  listBoards(): Board[] {
    const rows = this.listBoardsStmt.all() as DbBoardRow[];
    return rows.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order }));
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

