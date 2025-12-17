export type Board = {
  id: number;
  name: string;
  sortOrder: number;
};

export type PostSummary = {
  id: number;
  title: string;
  author: string;
  createdAt: string;
};

export type Post = {
  id: number;
  boardId: number;
  title: string;
  body: string;
  author: string;
  createdAt: string;
};

