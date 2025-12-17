import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

export type BoardRow = { id: number; name: string; sort_order: number };
export type PostRow = {
  id: number;
  board_id: number;
  title: string;
  body: string;
  author: string;
  created_at: string;
};

export class BbsDb {
  readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS boards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER NOT NULL REFERENCES boards(id),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        author TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_posts_board_id_id_desc
        ON posts(board_id, id DESC);
    `);
  }

  seedBoardsIfEmpty(): void {
    const row = this.db.prepare("SELECT COUNT(*) AS c FROM boards").get() as { c: number };
    if (row.c > 0) return;

    const insert = this.db.prepare("INSERT INTO boards(name, sort_order) VALUES(?, ?)");
    insert.run("공지", 0);
    insert.run("자유", 1);
    insert.run("개발", 2);
  }

  listBoards(): BoardRow[] {
    return this.db
      .prepare("SELECT id, name, sort_order FROM boards ORDER BY sort_order ASC, id ASC")
      .all() as BoardRow[];
  }

  getBoardById(boardId: number): BoardRow | undefined {
    return this.db
      .prepare("SELECT id, name, sort_order FROM boards WHERE id = ?")
      .get(boardId) as BoardRow | undefined;
  }

  listPosts(boardId: number, page: number, pageSize: number): { posts: PostRow[]; total: number } {
    const totalRow = this.db
      .prepare("SELECT COUNT(*) AS c FROM posts WHERE board_id = ?")
      .get(boardId) as { c: number };

    const total = totalRow.c ?? 0;
    const offset = (page - 1) * pageSize;
    const posts = this.db
      .prepare(
        "SELECT id, board_id, title, body, author, created_at FROM posts WHERE board_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
      )
      .all(boardId, pageSize, offset) as PostRow[];

    return { posts, total };
  }

  getPostById(postId: number): PostRow | undefined {
    return this.db
      .prepare("SELECT id, board_id, title, body, author, created_at FROM posts WHERE id = ?")
      .get(postId) as PostRow | undefined;
  }

  createPost(boardId: number, title: string, body: string, author: string): number {
    const result = this.db
      .prepare("INSERT INTO posts(board_id, title, body, author, created_at) VALUES(?, ?, ?, ?, datetime('now'))")
      .run(boardId, title, body, author);

    return Number(result.lastInsertRowid);
  }

  close(): void {
    this.db.close();
  }
}

export function removeFileIfExists(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code !== "ENOENT") throw err;
  }
}
