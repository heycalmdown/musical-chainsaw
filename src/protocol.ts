import type { StoredRichScreen } from "./ansi-screen";

export type ScreenAction = { type: "exit" };

export type ScreenKind =
  | "conferenceManage"
  | "conferenceAdd"
  | "conferenceRename"
  | "welcome"
  | "welcomeEditTitle"
  | "welcomeEditBody"
  | "menu"
  | "menuDesignTitle"
  | "menuDesignBody"
  | "menuEdit"
  | "menuEditLabel"
  | "menuEditDisplayNo"
  | "menuEditDisplayType"
  | "menuEditBoardSelect"
  | "menuEditConferenceSelect"
  | "menuEditLink"
  | "menuEditPageTitle"
  | "menuEditPageBody"
  | "menuAddType"
  | "menuAddLabel"
  | "menuAddBoardSelect"
  | "menuAddConferenceSelect"
  | "menuAddPageTitle"
  | "menuAddPageBody"
  | "menuAddLink"
  | "boardManage"
  | "boardAdd"
  | "boardRename"
  | "posts"
  | "post"
  | "writeTitle"
  | "writeBody"
  | "page"
  | "link";

export type ScreenModel = {
  screenKind: ScreenKind;
  title: string;
  lines: string[];
  ansiIr: StoredRichScreen;
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
  timeZone?: string;
};

export type CreateSessionResponse = {
  sessionId: string;
  screen: ScreenModel;
};

export type SessionEventRequest = {
  input: string;
  rows?: number;
  cols?: number;
  timeZone?: string;
};

export type SessionEventResponse =
  | {
      kind: "screen";
      screen: ScreenModel;
    }
  | {
      kind: "accepted";
    };

export type ApiErrorResponse = {
  error: { code: string; message: string };
};
