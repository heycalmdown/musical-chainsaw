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

export type CreateSessionRequest = {
  nickname: string;
  rows?: number;
  cols?: number;
};

export type CreateSessionResponse = {
  sessionId: string;
  screen: ScreenModel;
};

export type SessionEventRequest = {
  input: string;
};

export type SessionEventResponse = {
  screen: ScreenModel;
};

export type ApiErrorResponse = {
  error: { code: string; message: string };
};
