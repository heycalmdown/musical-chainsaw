import type { Board, Post, PostSummary } from "../domain";

export type ScreenModel = {
  title: string;
  lines: string[];
  prompt: string;
  inputMode: "line" | "multiline";
  hints?: string[];
  toast?: string;
  actions?: { type: "exit" }[];
};

export type UiHelloPayload = {
  user: string;
  rows: number;
  cols: number;
  pageSize?: number;
};

export type UiEventPayload = {
  input: string;
  rows: number;
  cols: number;
};

export type LegacyIpcRequest =
  | { id: number; type: "listBoards"; payload: Record<string, never> }
  | { id: number; type: "listPosts"; payload: { boardId: number; page: number; pageSize: number } }
  | { id: number; type: "getPost"; payload: { postId: number } }
  | { id: number; type: "createPost"; payload: { boardId: number; title: string; body: string; author: string } };

export type UiIpcRequest =
  | { id: number; type: "ui.hello"; payload: UiHelloPayload }
  | { id: number; type: "ui.event"; payload: UiEventPayload };

export type IpcRequest = LegacyIpcRequest | UiIpcRequest;

export type IpcOkResponse<TPayload> = {
  id: number;
  ok: true;
  payload: TPayload;
};

export type IpcError = {
  code: "BAD_JSON" | "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL";
  message: string;
};

export type IpcErrorResponse = {
  id: number | null;
  ok: false;
  error: IpcError;
};

export type IpcResponse =
  | IpcOkResponse<{ screen: ScreenModel }>
  | IpcOkResponse<{ boards: Board[] }>
  | IpcOkResponse<{ posts: PostSummary[]; page: number; pageSize: number }>
  | IpcOkResponse<{ post: Post }>
  | IpcOkResponse<{ postId: number }>
  | IpcErrorResponse;
