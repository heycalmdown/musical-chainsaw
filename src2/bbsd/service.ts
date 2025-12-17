import { BbsDb, type BoardRow, type PostRow } from "./db";

export class BbsService {
  constructor(private readonly db: BbsDb) {}

  listBoards(): BoardRow[] {
    return this.db.listBoards();
  }

  getBoard(boardId: number): BoardRow | undefined {
    return this.db.getBoardById(boardId);
  }

  listPosts(boardId: number, page: number, pageSize: number): { posts: PostRow[]; total: number } {
    return this.db.listPosts(boardId, page, pageSize);
  }

  getPost(postId: number): PostRow | undefined {
    return this.db.getPostById(postId);
  }

  createPost(boardId: number, title: string, body: string, author: string): number {
    return this.db.createPost(boardId, title, body, author);
  }
}
