export type ScreenAction = { type: "exit" };

export type ScreenModel = {
  title: string;
  lines: string[];
  prompt: string;
  inputMode: "line" | "multiline";
  hints?: string[];
  toast?: string;
  actions?: ScreenAction[];
};

export type UiHelloPayload = {
  user: string;
  rows?: number;
  cols?: number;
};

export type UiEventPayload = {
  input: string;
  rows?: number;
  cols?: number;
};

export type RequestMessage =
  | { id: number; type: "ui.hello"; payload: UiHelloPayload }
  | { id: number; type: "ui.event"; payload: UiEventPayload };

export type ResponseOk = { id: number; ok: true; payload: { screen: ScreenModel } };
export type ResponseError = {
  id: number;
  ok: false;
  error: { code: "BAD_REQUEST" | "INTERNAL"; message: string };
};

export type ResponseMessage = ResponseOk | ResponseError;

