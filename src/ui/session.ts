import type { Board, Conference, ConferenceMenuItem, Post, PostSummary } from "../domain";
import type { ScreenModel } from "../protocol";
import type { BbsDb } from "../db";

type TerminalContext = {
  user: string;
  rows: number;
  cols: number;
  postsPageSize: number;
};

type ModeConferenceManage = { kind: "conferenceManage"; conferences: Conference[] };
type ModeConferenceAdd = { kind: "conferenceAdd" };
type ModeConferenceRename = { kind: "conferenceRename"; conference: Conference };
type ModeWelcome = { kind: "welcome"; conference: Conference };
type ModeWelcomeEditTitle = { kind: "welcomeEditTitle"; conference: Conference };
type ModeWelcomeEditBody = { kind: "welcomeEditBody"; conference: Conference; title: string; lines: string[] };
type ModeMenu = { kind: "menu"; conference: Conference; items: ConferenceMenuItem[] };
type ModeMenuDesignTitle = { kind: "menuDesignTitle"; conference: Conference };
type ModeMenuDesignBody = { kind: "menuDesignBody"; conference: Conference; title: string; lines: string[] };
type ModeMenuEdit = { kind: "menuEdit"; conference: Conference; items: ConferenceMenuItem[] };
type ModeMenuEditLabel = { kind: "menuEditLabel"; conference: Conference; items: ConferenceMenuItem[]; item: ConferenceMenuItem };
type ModeMenuEditDisplayNo = {
  kind: "menuEditDisplayNo";
  conference: Conference;
  items: ConferenceMenuItem[];
  item: ConferenceMenuItem;
};
type ModeMenuEditDisplayType = {
  kind: "menuEditDisplayType";
  conference: Conference;
  items: ConferenceMenuItem[];
  item: ConferenceMenuItem;
};
type ModeMenuEditBoardSelect = {
  kind: "menuEditBoardSelect";
  conference: Conference;
  items: ConferenceMenuItem[];
  item: ConferenceMenuItem;
  boards: Board[];
};
type ModeMenuEditConferenceSelect = {
  kind: "menuEditConferenceSelect";
  conference: Conference;
  items: ConferenceMenuItem[];
  item: ConferenceMenuItem;
  conferences: Conference[];
};
type ModeMenuEditLink = { kind: "menuEditLink"; conference: Conference; items: ConferenceMenuItem[]; item: ConferenceMenuItem };
type ModeMenuEditPageTitle = {
  kind: "menuEditPageTitle";
  conference: Conference;
  items: ConferenceMenuItem[];
  item: ConferenceMenuItem;
};
type ModeMenuEditPageBody = {
  kind: "menuEditPageBody";
  conference: Conference;
  items: ConferenceMenuItem[];
  item: ConferenceMenuItem;
  title: string;
  lines: string[];
};
type ModeMenuAddType = { kind: "menuAddType"; conference: Conference; items: ConferenceMenuItem[] };
type ModeMenuAddLabel = {
  kind: "menuAddLabel";
  conference: Conference;
  items: ConferenceMenuItem[];
  actionType: ConferenceMenuItem["actionType"];
};
type ModeMenuAddBoardSelect = {
  kind: "menuAddBoardSelect";
  conference: Conference;
  items: ConferenceMenuItem[];
  label: string;
  boards: Board[];
};
type ModeMenuAddConferenceSelect = {
  kind: "menuAddConferenceSelect";
  conference: Conference;
  items: ConferenceMenuItem[];
  label: string;
  conferences: Conference[];
};
type ModeMenuAddPageTitle = { kind: "menuAddPageTitle"; conference: Conference; items: ConferenceMenuItem[]; label: string };
type ModeMenuAddPageBody = {
  kind: "menuAddPageBody";
  conference: Conference;
  items: ConferenceMenuItem[];
  label: string;
  title: string;
  lines: string[];
};
type ModeMenuAddLink = { kind: "menuAddLink"; conference: Conference; items: ConferenceMenuItem[]; label: string };
type ModeBoardManage = { kind: "boardManage"; conference: Conference; boards: Board[] };
type ModeBoardAdd = { kind: "boardAdd"; conference: Conference };
type ModeBoardRename = { kind: "boardRename"; conference: Conference; board: Board };
type ModePosts = { kind: "posts"; conference: Conference; board: Board; page: number; posts: PostSummary[] };
type ModePost = {
  kind: "post";
  conference: Conference;
  board: Board;
  postsReturnPage: number;
  post: Post;
  page: number;
};
type ModeWriteTitle = { kind: "writeTitle"; conference: Conference; board: Board; postsReturnPage: number };
type ModeWriteBody = {
  kind: "writeBody";
  conference: Conference;
  board: Board;
  postsReturnPage: number;
  title: string;
  lines: string[];
};
type ModePage = { kind: "page"; conference: Conference; item: ConferenceMenuItem; page: number };
type ModeLink = { kind: "link"; conference: Conference; item: ConferenceMenuItem };

type Mode =
  | ModeConferenceManage
  | ModeConferenceAdd
  | ModeConferenceRename
  | ModeWelcome
  | ModeWelcomeEditTitle
  | ModeWelcomeEditBody
  | ModeMenu
  | ModeMenuDesignTitle
  | ModeMenuDesignBody
  | ModeMenuEdit
  | ModeMenuEditLabel
  | ModeMenuEditDisplayNo
  | ModeMenuEditDisplayType
  | ModeMenuEditBoardSelect
  | ModeMenuEditConferenceSelect
  | ModeMenuEditLink
  | ModeMenuEditPageTitle
  | ModeMenuEditPageBody
  | ModeMenuAddType
  | ModeMenuAddLabel
  | ModeMenuAddBoardSelect
  | ModeMenuAddConferenceSelect
  | ModeMenuAddPageTitle
  | ModeMenuAddPageBody
  | ModeMenuAddLink
  | ModeBoardManage
  | ModeBoardAdd
  | ModeBoardRename
  | ModePosts
  | ModePost
  | ModeWriteTitle
  | ModeWriteBody
  | ModePage
  | ModeLink;

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function normalizeTerminalContext(input: Partial<TerminalContext>): TerminalContext {
  const user = typeof input.user === "string" && input.user.trim().length > 0 ? input.user.trim() : "anonymous";
  const rows = typeof input.rows === "number" && Number.isFinite(input.rows) ? clampInt(input.rows, 10, 200) : 24;
  const cols = typeof input.cols === "number" && Number.isFinite(input.cols) ? clampInt(input.cols, 20, 240) : 80;
  const postsPageSize =
    typeof input.postsPageSize === "number" && Number.isFinite(input.postsPageSize)
      ? clampInt(input.postsPageSize, 1, 50)
      : 10;

  return { user, rows, cols, postsPageSize };
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.replace("T", " ").replace("Z", "");
}

function sanitizePlainText(value: string): string {
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x1b]/g, "");
}

function wrapLine(line: string, width: number): string[] {
  if (width <= 0) return [line];
  if (line.length <= width) return [line];

  const parts: string[] = [];
  let rest = line;
  while (rest.length > width) {
    parts.push(rest.slice(0, width));
    rest = rest.slice(width);
  }
  parts.push(rest);
  return parts;
}

function wrapText(text: string, width: number): string[] {
  const safeText = sanitizePlainText(text).replace(/\r\n/g, "\n");
  const lines = safeText.split("\n");
  return lines.flatMap((line) => wrapLine(line, width));
}

function splitPlainLines(text: string): string[] {
  if (!text) return [];
  return sanitizePlainText(text).replace(/\r\n/g, "\n").split("\n");
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages.length ? pages : [[]];
}

function nextSortOrder(items: ConferenceMenuItem[]): number {
  let max = 0;
  for (const item of items) max = Math.max(max, item.sortOrder);
  return max + 1;
}

export class BbsUiSession {
  private ctx: TerminalContext = normalizeTerminalContext({});
  private mode: Mode = { kind: "conferenceManage", conferences: [] };
  private toast: string | undefined;
  private rootConferenceId: number | null = null;

  constructor(private readonly db: BbsDb) {}

  handleHello(payload: { user: string; rows?: number; cols?: number; pageSize?: number }): ScreenModel {
    this.ctx = normalizeTerminalContext({
      user: payload.user,
      rows: payload.rows,
      cols: payload.cols,
      postsPageSize: payload.pageSize,
    });

    const root = this.db.getRootConference();
    if (root) {
      this.rootConferenceId = root.id;
      this.mode = { kind: "welcome", conference: root };
    } else {
      const conferences = this.db.listConferences();
      this.mode = { kind: "conferenceManage", conferences };
    }
    return this.render();
  }

  handleEvent(inputRaw: string): ScreenModel {
    const inputTrimmed = inputRaw.trim();
    const cmd = inputTrimmed.toUpperCase();
    const exitSession = () =>
      this.screen({
        title: "Bye",
        lines: ["Session ended."],
        prompt: "",
        inputMode: "line",
        actions: [{ type: "exit" }],
      });
    const openMenu = (conference: Conference) => {
      const items = this.db.listMenuItems(conference.id);
      this.mode = { kind: "menu", conference, items };
      return this.render();
    };
    const openWelcome = (conference: Conference) => {
      this.mode = { kind: "welcome", conference };
      return this.render();
    };
    const openRootMenu = () => {
      const root = this.db.getRootConference();
      if (!root) return exitSession();
      this.rootConferenceId = root.id;
      return openMenu(root);
    };
    const openMenuEdit = (conference: Conference) => {
      const items = this.db.listMenuItems(conference.id);
      this.mode = { kind: "menuEdit", conference, items };
      return this.render();
    };
    const openMenuDesign = (conference: Conference) => {
      this.mode = { kind: "menuDesignTitle", conference };
      return this.render();
    };
    const openBoardManage = (conference: Conference) => {
      const boards = this.db.listBoards(conference.id);
      this.mode = { kind: "boardManage", conference, boards };
      return this.render();
    };
    const openConferenceManage = () => {
      const conferences = this.db.listConferences();
      this.mode = { kind: "conferenceManage", conferences };
      return this.render();
    };

    if (this.mode.kind === "conferenceManage") {
      if (cmd === "0") {
        return openRootMenu();
      }
      if (cmd === "A") {
        this.mode = { kind: "conferenceAdd" };
        return this.render();
      }

      const renameMatch = /^R\s+(\d+)$/i.exec(inputTrimmed);
      if (renameMatch) {
        const index = Number(renameMatch[1]);
        if (!Number.isFinite(index) || index < 1 || index > this.mode.conferences.length) {
          this.toast = "Invalid conference number.";
          return this.render();
        }
        const conference = this.mode.conferences[index - 1]!;
        this.mode = { kind: "conferenceRename", conference };
        return this.render();
      }

      const deleteMatch = /^D\s+(\d+)$/i.exec(inputTrimmed);
      if (deleteMatch) {
        const index = Number(deleteMatch[1]);
        if (!Number.isFinite(index) || index < 1 || index > this.mode.conferences.length) {
          this.toast = "Invalid conference number.";
          return this.render();
        }
        const conference = this.mode.conferences[index - 1]!;
        const deleted = this.db.deleteConference({ conferenceId: conference.id });
        const conferences = this.db.listConferences();
        this.mode = { kind: "conferenceManage", conferences };
        this.toast = deleted ? "Conference deleted." : "Unable to delete conference.";
        return this.render();
      }

      this.toast = "Commands: A, R <n>, D <n>, 0";
      return this.render();
    }

    if (this.mode.kind === "conferenceAdd") {
      if (inputTrimmed === "0") {
        return openConferenceManage();
      }

      const name = inputTrimmed;
      if (!name) {
        this.toast = "Name cannot be empty.";
        return this.render();
      }
      if (name.length > 40) {
        this.toast = "Name must be <= 40 chars.";
        return this.render();
      }

      this.db.createConference({ name, updatedBy: this.ctx.user });
      const conferences = this.db.listConferences();
      this.mode = { kind: "conferenceManage", conferences };
      this.toast = "Conference created.";
      return this.render();
    }

    if (this.mode.kind === "conferenceRename") {
      if (inputTrimmed === "0") {
        return openConferenceManage();
      }

      const name = inputTrimmed;
      if (!name) {
        this.toast = "Name cannot be empty.";
        return this.render();
      }
      if (name.length > 40) {
        this.toast = "Name must be <= 40 chars.";
        return this.render();
      }

      this.db.renameConference({ conferenceId: this.mode.conference.id, name, updatedBy: this.ctx.user });
      const conferences = this.db.listConferences();
      this.mode = { kind: "conferenceManage", conferences };
      this.toast = "Conference renamed.";
      return this.render();
    }

    if (this.mode.kind === "welcome") {
      if (cmd === "E") {
        this.mode = { kind: "welcomeEditTitle", conference: this.mode.conference };
        return this.render();
      }

      return openMenu(this.mode.conference);
    }

    if (this.mode.kind === "welcomeEditTitle") {
      if (inputTrimmed === "0") {
        this.mode = { kind: "welcome", conference: this.mode.conference };
        return this.render();
      }

      const title = inputTrimmed;
      if (title.length === 0) {
        this.toast = "Title cannot be empty.";
        return this.render();
      }
      if (title.length > 60) {
        this.toast = "Title must be <= 60 chars.";
        return this.render();
      }

      this.mode = { kind: "welcomeEditBody", conference: this.mode.conference, title, lines: [] };
      return this.render();
    }

    if (this.mode.kind === "welcomeEditBody") {
      if (inputTrimmed === "0") {
        this.mode = { kind: "welcome", conference: this.mode.conference };
        return this.render();
      }

      if (inputTrimmed === ".") {
        const body = this.mode.lines.join("\n").trimEnd();
        this.db.updateConferenceWelcome({
          conferenceId: this.mode.conference.id,
          title: this.mode.title,
          body,
          updatedBy: this.ctx.user,
        });

        const conference = this.db.getConference(this.mode.conference.id) ?? this.mode.conference;
        this.mode = { kind: "welcome", conference };
        this.toast = "Welcome updated.";
        return this.render();
      }

      this.mode.lines.push(inputRaw);
      return this.render();
    }

    if (this.mode.kind === "menuDesignTitle") {
      if (inputTrimmed === "0") {
        return openMenu(this.mode.conference);
      }

      const title = inputTrimmed;
      if (title.length > 60) {
        this.toast = "Title must be <= 60 chars.";
        return this.render();
      }

      this.mode = { kind: "menuDesignBody", conference: this.mode.conference, title, lines: [] };
      return this.render();
    }

    if (this.mode.kind === "menuDesignBody") {
      if (inputTrimmed === "0") {
        return openMenu(this.mode.conference);
      }

      if (inputTrimmed === ".") {
        const body = this.mode.lines.join("\n").trimEnd();
        this.db.updateConferenceMenu({
          conferenceId: this.mode.conference.id,
          title: this.mode.title,
          body,
          updatedBy: this.ctx.user,
        });

        const conference = this.db.getConference(this.mode.conference.id) ?? this.mode.conference;
        this.toast = "Menu updated.";
        return openMenu(conference);
      }

      this.mode.lines.push(inputRaw);
      return this.render();
    }

    if (this.mode.kind === "menu") {
      if (cmd === "0") {
        if (this.mode.conference.isRoot) {
          return exitSession();
        }
        return openRootMenu();
      }

      if (cmd === "E") {
        return openMenuDesign(this.mode.conference);
      }

      if (cmd === "I") {
        return openMenuEdit(this.mode.conference);
      }

      const selected = Number(inputTrimmed);
      const allItems = this.mode.items;
      if (!Number.isFinite(selected) || selected < 1 || selected > allItems.length) {
        this.toast = "Select a menu number.";
        return this.render();
      }

      const item = allItems[selected - 1]!;
      if (item.actionType === "board") {
        const boardId = Number(item.actionRef);
        if (!Number.isFinite(boardId) || boardId < 1) {
          this.toast = "Menu item has invalid board.";
          return this.render();
        }
        const board = this.db.getBoard(boardId);
        if (!board || board.conferenceId !== this.mode.conference.id) {
          this.toast = "Board not found for this conference.";
          return this.render();
        }

        const page = 1;
        const posts = this.db.listPosts(board.id, page, this.ctx.postsPageSize);
        this.mode = { kind: "posts", conference: this.mode.conference, board, page, posts };
        return this.render();
      }

      if (item.actionType === "page") {
        this.mode = { kind: "page", conference: this.mode.conference, item, page: 1 };
        return this.render();
      }

      if (item.actionType === "link") {
        this.mode = { kind: "link", conference: this.mode.conference, item };
        return this.render();
      }

      if (item.actionType === "conference") {
        const conferenceId = Number(item.actionRef);
        if (!Number.isFinite(conferenceId) || conferenceId < 1) {
          this.toast = "Menu item has invalid conference.";
          return this.render();
        }
        const conference = this.db.getConference(conferenceId);
        if (!conference || conference.isRoot) {
          this.toast = "Conference not found.";
          return this.render();
        }
        return openWelcome(conference);
      }

      this.toast = "Unsupported menu item.";
      return this.render();
    }

    if (this.mode.kind === "menuEdit") {
      if (cmd === "0") {
        return openMenu(this.mode.conference);
      }

      if (cmd === "A") {
        this.mode = { kind: "menuAddType", conference: this.mode.conference, items: this.mode.items };
        return this.render();
      }

      if (cmd === "B") {
        if (this.mode.conference.isRoot) {
          this.toast = "Boards are not available for root.";
          return this.render();
        }
        return openBoardManage(this.mode.conference);
      }

      if (cmd === "C") {
        if (!this.mode.conference.isRoot) {
          this.toast = "Conference management is only available in root.";
          return this.render();
        }
        return openConferenceManage();
      }

      const deleteMatch = /^D\s+(\d+)$/i.exec(inputTrimmed);
      if (deleteMatch) {
        const index = Number(deleteMatch[1]);
        if (!Number.isFinite(index) || index < 1 || index > this.mode.items.length) {
          this.toast = "Invalid item number.";
          return this.render();
        }
        const item = this.mode.items[index - 1]!;
        this.db.deleteMenuItem({ conferenceId: this.mode.conference.id, menuItemId: item.id });
        this.toast = "Menu item deleted.";
        return openMenuEdit(this.mode.conference);
      }

      const hideMatch = /^H\s+(\d+)$/i.exec(inputTrimmed);
      if (hideMatch) {
        const index = Number(hideMatch[1]);
        if (!Number.isFinite(index) || index < 1 || index > this.mode.items.length) {
          this.toast = "Invalid item number.";
          return this.render();
        }
        const item = this.mode.items[index - 1]!;
        this.db.setMenuItemHidden({
          conferenceId: this.mode.conference.id,
          menuItemId: item.id,
          hidden: !item.hidden,
          updatedBy: this.ctx.user,
        });
        this.toast = item.hidden ? "Menu item shown." : "Menu item hidden.";
        return openMenuEdit(this.mode.conference);
      }

      const moveMatch = /^M\s+(\d+)\s+(\d+)$/i.exec(inputTrimmed);
      if (moveMatch) {
        const from = Number(moveMatch[1]);
        const to = Number(moveMatch[2]);
        if (
          !Number.isFinite(from) ||
          !Number.isFinite(to) ||
          from < 1 ||
          to < 1 ||
          from > this.mode.items.length ||
          to > this.mode.items.length
        ) {
          this.toast = "Usage: M <from> <to>";
          return this.render();
        }

        if (from !== to) {
          const reordered = [...this.mode.items];
          const [moved] = reordered.splice(from - 1, 1);
          reordered.splice(to - 1, 0, moved!);
          this.db.setMenuItemOrder({
            conferenceId: this.mode.conference.id,
            orderedIds: reordered.map((item) => item.id),
            updatedBy: this.ctx.user,
          });
        }

        this.toast = "Menu order updated.";
        return openMenuEdit(this.mode.conference);
      }

      const labelMatch = /^L\s+(\d+)$/i.exec(inputTrimmed);
      if (labelMatch) {
        const index = Number(labelMatch[1]);
        if (!Number.isFinite(index) || index < 1 || index > this.mode.items.length) {
          this.toast = "Invalid item number.";
          return this.render();
        }
        const item = this.mode.items[index - 1]!;
        this.mode = { kind: "menuEditLabel", conference: this.mode.conference, items: this.mode.items, item };
        return this.render();
      }

      const displayNoMatch = /^N\s+(\d+)$/i.exec(inputTrimmed);
      if (displayNoMatch) {
        const index = Number(displayNoMatch[1]);
        if (!Number.isFinite(index) || index < 1 || index > this.mode.items.length) {
          this.toast = "Invalid item number.";
          return this.render();
        }
        const item = this.mode.items[index - 1]!;
        this.mode = { kind: "menuEditDisplayNo", conference: this.mode.conference, items: this.mode.items, item };
        return this.render();
      }

      const displayTypeMatch = /^Y\s+(\d+)$/i.exec(inputTrimmed);
      if (displayTypeMatch) {
        const index = Number(displayTypeMatch[1]);
        if (!Number.isFinite(index) || index < 1 || index > this.mode.items.length) {
          this.toast = "Invalid item number.";
          return this.render();
        }
        const item = this.mode.items[index - 1]!;
        this.mode = { kind: "menuEditDisplayType", conference: this.mode.conference, items: this.mode.items, item };
        return this.render();
      }

      const updateMatch = /^U\s+(\d+)$/i.exec(inputTrimmed);
      if (updateMatch) {
        const index = Number(updateMatch[1]);
        if (!Number.isFinite(index) || index < 1 || index > this.mode.items.length) {
          this.toast = "Invalid item number.";
          return this.render();
        }
        const item = this.mode.items[index - 1]!;
        if (item.actionType === "board") {
          const boards = this.db.listBoards(this.mode.conference.id);
          if (boards.length === 0) {
            this.toast = "No boards available.";
            return this.render();
          }
          this.mode = { kind: "menuEditBoardSelect", conference: this.mode.conference, items: this.mode.items, item, boards };
          return this.render();
        }
        if (item.actionType === "conference") {
          const conferences = this.db.listConferences();
          if (conferences.length === 0) {
            this.toast = "No conferences available.";
            return this.render();
          }
          this.mode = {
            kind: "menuEditConferenceSelect",
            conference: this.mode.conference,
            items: this.mode.items,
            item,
            conferences,
          };
          return this.render();
        }
        if (item.actionType === "link") {
          this.mode = { kind: "menuEditLink", conference: this.mode.conference, items: this.mode.items, item };
          return this.render();
        }
        if (item.actionType === "page") {
          this.mode = { kind: "menuEditPageTitle", conference: this.mode.conference, items: this.mode.items, item };
          return this.render();
        }
      }

      this.toast = "Commands: A, L <n>, N <n>, Y <n>, U <n>, H <n>, D <n>, M <from> <to>, 0";
      return this.render();
    }

    if (this.mode.kind === "menuEditLabel") {
      if (inputTrimmed === "0") {
        return openMenuEdit(this.mode.conference);
      }

      const label = inputTrimmed;
      if (!label) {
        this.toast = "Label cannot be empty.";
        return this.render();
      }
      if (label.length > 40) {
        this.toast = "Label must be <= 40 chars.";
        return this.render();
      }

      this.db.updateMenuItemMeta({
        conferenceId: this.mode.conference.id,
        menuItemId: this.mode.item.id,
        label,
        displayNo: this.mode.item.displayNo,
        displayType: this.mode.item.displayType,
        updatedBy: this.ctx.user,
      });
      this.toast = "Menu label updated.";
      return openMenuEdit(this.mode.conference);
    }

    if (this.mode.kind === "menuEditDisplayNo") {
      if (inputTrimmed === "0") {
        return openMenuEdit(this.mode.conference);
      }

      const displayNo = inputTrimmed;
      if (displayNo.length > 20) {
        this.toast = "Display number must be <= 20 chars.";
        return this.render();
      }

      this.db.updateMenuItemMeta({
        conferenceId: this.mode.conference.id,
        menuItemId: this.mode.item.id,
        label: this.mode.item.label,
        displayNo,
        displayType: this.mode.item.displayType,
        updatedBy: this.ctx.user,
      });
      this.toast = "Display number updated.";
      return openMenuEdit(this.mode.conference);
    }

    if (this.mode.kind === "menuEditDisplayType") {
      if (inputTrimmed === "0") {
        return openMenuEdit(this.mode.conference);
      }

      const displayType = inputTrimmed;
      if (displayType.length > 20) {
        this.toast = "Display type must be <= 20 chars.";
        return this.render();
      }

      this.db.updateMenuItemMeta({
        conferenceId: this.mode.conference.id,
        menuItemId: this.mode.item.id,
        label: this.mode.item.label,
        displayNo: this.mode.item.displayNo,
        displayType,
        updatedBy: this.ctx.user,
      });
      this.toast = "Display type updated.";
      return openMenuEdit(this.mode.conference);
    }

    if (this.mode.kind === "menuEditBoardSelect") {
      if (inputTrimmed === "0") {
        return openMenuEdit(this.mode.conference);
      }

      const selected = Number(inputTrimmed);
      if (!Number.isFinite(selected) || selected < 1 || selected > this.mode.boards.length) {
        this.toast = "Select a board number.";
        return this.render();
      }

      const board = this.mode.boards[selected - 1]!;
      this.db.updateMenuItemContent({
        conferenceId: this.mode.conference.id,
        menuItemId: this.mode.item.id,
        actionRef: String(board.id),
        body: this.mode.item.body,
        updatedBy: this.ctx.user,
      });
      this.toast = "Menu target updated.";
      return openMenuEdit(this.mode.conference);
    }

    if (this.mode.kind === "menuEditConferenceSelect") {
      if (inputTrimmed === "0") {
        return openMenuEdit(this.mode.conference);
      }

      const selected = Number(inputTrimmed);
      if (!Number.isFinite(selected) || selected < 1 || selected > this.mode.conferences.length) {
        this.toast = "Select a conference number.";
        return this.render();
      }

      const conference = this.mode.conferences[selected - 1]!;
      this.db.updateMenuItemContent({
        conferenceId: this.mode.conference.id,
        menuItemId: this.mode.item.id,
        actionRef: String(conference.id),
        body: this.mode.item.body,
        updatedBy: this.ctx.user,
      });
      this.toast = "Menu target updated.";
      return openMenuEdit(this.mode.conference);
    }

    if (this.mode.kind === "menuEditLink") {
      if (inputTrimmed === "0") {
        return openMenuEdit(this.mode.conference);
      }

      const url = inputTrimmed;
      if (!url) {
        this.toast = "URL cannot be empty.";
        return this.render();
      }
      if (url.length > 200) {
        this.toast = "URL must be <= 200 chars.";
        return this.render();
      }

      this.db.updateMenuItemContent({
        conferenceId: this.mode.conference.id,
        menuItemId: this.mode.item.id,
        actionRef: url,
        body: this.mode.item.body,
        updatedBy: this.ctx.user,
      });
      this.toast = "Menu link updated.";
      return openMenuEdit(this.mode.conference);
    }

    if (this.mode.kind === "menuEditPageTitle") {
      if (inputTrimmed === "0") {
        return openMenuEdit(this.mode.conference);
      }

      const title = inputTrimmed;
      if (!title) {
        this.toast = "Title cannot be empty.";
        return this.render();
      }
      if (title.length > 60) {
        this.toast = "Title must be <= 60 chars.";
        return this.render();
      }

      this.mode = {
        kind: "menuEditPageBody",
        conference: this.mode.conference,
        items: this.mode.items,
        item: this.mode.item,
        title,
        lines: [],
      };
      return this.render();
    }

    if (this.mode.kind === "menuEditPageBody") {
      if (inputTrimmed === "0") {
        return openMenuEdit(this.mode.conference);
      }

      if (inputTrimmed === ".") {
        const body = this.mode.lines.join("\n").trimEnd();
        this.db.updateMenuItemContent({
          conferenceId: this.mode.conference.id,
          menuItemId: this.mode.item.id,
          actionRef: this.mode.title,
          body,
          updatedBy: this.ctx.user,
        });
        this.toast = "Menu page updated.";
        return openMenuEdit(this.mode.conference);
      }

      this.mode.lines.push(inputRaw);
      return this.render();
    }

    if (this.mode.kind === "menuAddType") {
      if (cmd === "0") {
        return openMenuEdit(this.mode.conference);
      }

      if (cmd === "B" || cmd === "P" || cmd === "L" || cmd === "C") {
        const actionType =
          cmd === "B" ? "board" : cmd === "P" ? "page" : cmd === "L" ? "link" : "conference";
        this.mode = { kind: "menuAddLabel", conference: this.mode.conference, items: this.mode.items, actionType };
        return this.render();
      }

      this.toast = "Select type: B, P, L, C, 0";
      return this.render();
    }

    if (this.mode.kind === "menuAddLabel") {
      if (inputTrimmed === "0") {
        const items = this.db.listMenuItems(this.mode.conference.id);
        this.mode = { kind: "menuEdit", conference: this.mode.conference, items };
        return this.render();
      }

      const label = inputTrimmed;
      if (!label) {
        this.toast = "Label cannot be empty.";
        return this.render();
      }
      if (label.length > 40) {
        this.toast = "Label must be <= 40 chars.";
        return this.render();
      }

      if (this.mode.actionType === "board") {
        const boards = this.db.listBoards(this.mode.conference.id);
        if (boards.length === 0) {
          this.toast = "No boards available.";
          return openMenuEdit(this.mode.conference);
        }
        this.mode = { kind: "menuAddBoardSelect", conference: this.mode.conference, items: this.mode.items, label, boards };
        return this.render();
      }

      if (this.mode.actionType === "conference") {
        const conferences = this.db.listConferences();
        if (conferences.length === 0) {
          this.toast = "No conferences available.";
          return openMenuEdit(this.mode.conference);
        }
        this.mode = {
          kind: "menuAddConferenceSelect",
          conference: this.mode.conference,
          items: this.mode.items,
          label,
          conferences,
        };
        return this.render();
      }

      if (this.mode.actionType === "page") {
        this.mode = { kind: "menuAddPageTitle", conference: this.mode.conference, items: this.mode.items, label };
        return this.render();
      }

      this.mode = { kind: "menuAddLink", conference: this.mode.conference, items: this.mode.items, label };
      return this.render();
    }

    if (this.mode.kind === "menuAddBoardSelect") {
      if (inputTrimmed === "0") {
        return openMenuEdit(this.mode.conference);
      }

      const selected = Number(inputTrimmed);
      if (!Number.isFinite(selected) || selected < 1 || selected > this.mode.boards.length) {
        this.toast = "Select a board number.";
        return this.render();
      }

      const board = this.mode.boards[selected - 1]!;
      const existingItems = this.db.listMenuItems(this.mode.conference.id);
      const sortOrder = nextSortOrder(existingItems);
      this.db.createMenuItem({
        conferenceId: this.mode.conference.id,
        label: this.mode.label,
        displayNo: "",
        displayType: "",
        actionType: "board",
        actionRef: String(board.id),
        body: "",
        sortOrder,
        hidden: false,
        updatedBy: this.ctx.user,
      });

      this.toast = "Menu item added.";
      return openMenuEdit(this.mode.conference);
    }

    if (this.mode.kind === "menuAddConferenceSelect") {
      if (inputTrimmed === "0") {
        return openMenuEdit(this.mode.conference);
      }

      const selected = Number(inputTrimmed);
      if (!Number.isFinite(selected) || selected < 1 || selected > this.mode.conferences.length) {
        this.toast = "Select a conference number.";
        return this.render();
      }

      const conference = this.mode.conferences[selected - 1]!;
      const existingItems = this.db.listMenuItems(this.mode.conference.id);
      const sortOrder = nextSortOrder(existingItems);
      this.db.createMenuItem({
        conferenceId: this.mode.conference.id,
        label: this.mode.label,
        displayNo: "",
        displayType: "",
        actionType: "conference",
        actionRef: String(conference.id),
        body: "",
        sortOrder,
        hidden: false,
        updatedBy: this.ctx.user,
      });

      this.toast = "Menu item added.";
      return openMenuEdit(this.mode.conference);
    }

    if (this.mode.kind === "menuAddPageTitle") {
      if (inputTrimmed === "0") {
        return openMenuEdit(this.mode.conference);
      }

      const title = inputTrimmed;
      if (!title) {
        this.toast = "Title cannot be empty.";
        return this.render();
      }
      if (title.length > 60) {
        this.toast = "Title must be <= 60 chars.";
        return this.render();
      }

      this.mode = {
        kind: "menuAddPageBody",
        conference: this.mode.conference,
        items: this.mode.items,
        label: this.mode.label,
        title,
        lines: [],
      };
      return this.render();
    }

    if (this.mode.kind === "menuAddPageBody") {
      if (inputTrimmed === "0") {
        return openMenuEdit(this.mode.conference);
      }

      if (inputTrimmed === ".") {
        const body = this.mode.lines.join("\n").trimEnd();
        const existingItems = this.db.listMenuItems(this.mode.conference.id);
        const sortOrder = nextSortOrder(existingItems);
        this.db.createMenuItem({
          conferenceId: this.mode.conference.id,
          label: this.mode.label,
          displayNo: "",
          displayType: "",
          actionType: "page",
          actionRef: this.mode.title,
          body,
          sortOrder,
          hidden: false,
          updatedBy: this.ctx.user,
        });

        this.toast = "Menu page added.";
        return openMenuEdit(this.mode.conference);
      }

      this.mode.lines.push(inputRaw);
      return this.render();
    }

    if (this.mode.kind === "menuAddLink") {
      if (inputTrimmed === "0") {
        return openMenuEdit(this.mode.conference);
      }

      const url = inputTrimmed;
      if (!url) {
        this.toast = "URL cannot be empty.";
        return this.render();
      }
      if (url.length > 200) {
        this.toast = "URL must be <= 200 chars.";
        return this.render();
      }

      const existingItems = this.db.listMenuItems(this.mode.conference.id);
      const sortOrder = nextSortOrder(existingItems);
      this.db.createMenuItem({
        conferenceId: this.mode.conference.id,
        label: this.mode.label,
        displayNo: "",
        displayType: "",
        actionType: "link",
        actionRef: url,
        body: "",
        sortOrder,
        hidden: false,
        updatedBy: this.ctx.user,
      });

      this.toast = "Menu link added.";
      return openMenuEdit(this.mode.conference);
    }

    if (this.mode.kind === "boardManage") {
      if (cmd === "0") {
        return openMenuEdit(this.mode.conference);
      }

      if (cmd === "A") {
        this.mode = { kind: "boardAdd", conference: this.mode.conference };
        return this.render();
      }

      const renameMatch = /^R\s+(\d+)$/i.exec(inputTrimmed);
      if (renameMatch) {
        const index = Number(renameMatch[1]);
        if (!Number.isFinite(index) || index < 1 || index > this.mode.boards.length) {
          this.toast = "Invalid board number.";
          return this.render();
        }
        const board = this.mode.boards[index - 1]!;
        this.mode = { kind: "boardRename", conference: this.mode.conference, board };
        return this.render();
      }

      const deleteMatch = /^D\s+(\d+)$/i.exec(inputTrimmed);
      if (deleteMatch) {
        const index = Number(deleteMatch[1]);
        if (!Number.isFinite(index) || index < 1 || index > this.mode.boards.length) {
          this.toast = "Invalid board number.";
          return this.render();
        }
        const board = this.mode.boards[index - 1]!;
        this.db.deleteBoard({ conferenceId: this.mode.conference.id, boardId: board.id });
        const boards = this.db.listBoards(this.mode.conference.id);
        this.mode = { kind: "boardManage", conference: this.mode.conference, boards };
        this.toast = "Board deleted.";
        return this.render();
      }

      this.toast = "Commands: A, R <n>, D <n>, 0";
      return this.render();
    }

    if (this.mode.kind === "boardAdd") {
      if (inputTrimmed === "0") {
        return openBoardManage(this.mode.conference);
      }

      const name = inputTrimmed;
      if (!name) {
        this.toast = "Name cannot be empty.";
        return this.render();
      }
      if (name.length > 40) {
        this.toast = "Name must be <= 40 chars.";
        return this.render();
      }

      this.db.createBoard({ conferenceId: this.mode.conference.id, name });
      const boards = this.db.listBoards(this.mode.conference.id);
      this.mode = { kind: "boardManage", conference: this.mode.conference, boards };
      this.toast = "Board added.";
      return this.render();
    }

    if (this.mode.kind === "boardRename") {
      if (inputTrimmed === "0") {
        return openBoardManage(this.mode.conference);
      }

      const name = inputTrimmed;
      if (!name) {
        this.toast = "Name cannot be empty.";
        return this.render();
      }
      if (name.length > 40) {
        this.toast = "Name must be <= 40 chars.";
        return this.render();
      }

      this.db.renameBoard({ conferenceId: this.mode.conference.id, boardId: this.mode.board.id, name });
      const boards = this.db.listBoards(this.mode.conference.id);
      this.mode = { kind: "boardManage", conference: this.mode.conference, boards };
      this.toast = "Board renamed.";
      return this.render();
    }

    if (this.mode.kind === "posts") {
      if (cmd === "0") {
        return openMenu(this.mode.conference);
      }

      if (cmd === "N") {
        const nextPage = this.mode.page + 1;
        const posts = this.db.listPosts(this.mode.board.id, nextPage, this.ctx.postsPageSize);
        if (posts.length === 0) {
          this.toast = "No more posts.";
          return this.render();
        }
        this.mode = { ...this.mode, page: nextPage, posts };
        return this.render();
      }

      if (cmd === "P") {
        if (this.mode.page <= 1) {
          this.toast = "Already at first page.";
          return this.render();
        }
        const prevPage = this.mode.page - 1;
        const posts = this.db.listPosts(this.mode.board.id, prevPage, this.ctx.postsPageSize);
        this.mode = { ...this.mode, page: prevPage, posts };
        return this.render();
      }

      if (cmd === "W") {
        this.mode = {
          kind: "writeTitle",
          conference: this.mode.conference,
          board: this.mode.board,
          postsReturnPage: this.mode.page,
        };
        return this.render();
      }

      const readMatch = /^R(?:\s+(\d+))?$/i.exec(inputTrimmed);
      if (readMatch) {
        const postId = readMatch[1] ? Number(readMatch[1]) : NaN;
        if (!Number.isFinite(postId) || postId < 1) {
          this.toast = "Usage: R <postId>";
          return this.render();
        }

        const post = this.db.getPost(postId);
        if (!post || post.boardId !== this.mode.board.id) {
          this.toast = `Post not found: ${postId}`;
          return this.render();
        }

        this.mode = {
          kind: "post",
          conference: this.mode.conference,
          board: this.mode.board,
          postsReturnPage: this.mode.page,
          post,
          page: 1,
        };
        return this.render();
      }

      this.toast = "Commands: N, P, R <id>, W, 0";
      return this.render();
    }

    if (this.mode.kind === "post") {
      if (cmd === "0") {
        const posts = this.db.listPosts(this.mode.board.id, this.mode.postsReturnPage, this.ctx.postsPageSize);
        this.mode = {
          kind: "posts",
          conference: this.mode.conference,
          board: this.mode.board,
          page: this.mode.postsReturnPage,
          posts,
        };
        return this.render();
      }

      if (cmd === "N") {
        this.mode = { ...this.mode, page: this.mode.page + 1 };
        return this.render();
      }

      if (cmd === "P") {
        this.mode = { ...this.mode, page: Math.max(1, this.mode.page - 1) };
        return this.render();
      }

      this.toast = "Commands: N, P, 0";
      return this.render();
    }

    if (this.mode.kind === "writeTitle") {
      if (inputTrimmed === "0") {
        const posts = this.db.listPosts(this.mode.board.id, this.mode.postsReturnPage, this.ctx.postsPageSize);
        this.mode = {
          kind: "posts",
          conference: this.mode.conference,
          board: this.mode.board,
          page: this.mode.postsReturnPage,
          posts,
        };
        return this.render();
      }

      const title = inputTrimmed;
      if (title.length === 0) {
        this.toast = "Title cannot be empty.";
        return this.render();
      }

      this.mode = {
        kind: "writeBody",
        conference: this.mode.conference,
        board: this.mode.board,
        postsReturnPage: this.mode.postsReturnPage,
        title,
        lines: [],
      };
      return this.render();
    }

    if (this.mode.kind === "writeBody") {
      if (inputTrimmed === "0") {
        const posts = this.db.listPosts(this.mode.board.id, this.mode.postsReturnPage, this.ctx.postsPageSize);
        this.mode = {
          kind: "posts",
          conference: this.mode.conference,
          board: this.mode.board,
          page: this.mode.postsReturnPage,
          posts,
        };
        return this.render();
      }

      if (inputTrimmed === ".") {
        const body = this.mode.lines.join("\n").trimEnd();
        if (body.trim().length === 0) {
          this.toast = "Body cannot be empty.";
          return this.render();
        }

        const postId = this.db.createPost({
          boardId: this.mode.board.id,
          title: this.mode.title,
          body,
          author: this.ctx.user,
        });

        const page = 1;
        const posts = this.db.listPosts(this.mode.board.id, page, this.ctx.postsPageSize);
        this.mode = { kind: "posts", conference: this.mode.conference, board: this.mode.board, page, posts };
        this.toast = `Posted #${postId}`;
        return this.render();
      }

      this.mode.lines.push(inputRaw);
      return this.render();
    }

    if (this.mode.kind === "page") {
      if (cmd === "0") {
        return openMenu(this.mode.conference);
      }

      if (cmd === "N") {
        this.mode = { ...this.mode, page: this.mode.page + 1 };
        return this.render();
      }

      if (cmd === "P") {
        this.mode = { ...this.mode, page: Math.max(1, this.mode.page - 1) };
        return this.render();
      }

      this.toast = "Commands: N, P, 0";
      return this.render();
    }

    if (this.mode.kind === "link") {
      if (inputTrimmed === "0") {
        return openMenu(this.mode.conference);
      }

      this.toast = "Press 0 to return.";
      return this.render();
    }

    return this.render();
  }

  private takeToast(): string | undefined {
    const toast = this.toast;
    this.toast = undefined;
    return toast;
  }

  private screen(screen: Omit<ScreenModel, "toast">): ScreenModel {
    const toast = this.takeToast();
    return toast ? { ...screen, toast } : screen;
  }

  render(): ScreenModel {
    switch (this.mode.kind) {
      case "conferenceManage":
        return this.renderConferenceManage(this.mode);
      case "conferenceAdd":
        return this.renderConferenceAdd(this.mode);
      case "conferenceRename":
        return this.renderConferenceRename(this.mode);
      case "welcome":
        return this.renderWelcome(this.mode);
      case "welcomeEditTitle":
        return this.renderWelcomeEditTitle(this.mode);
      case "welcomeEditBody":
        return this.renderWelcomeEditBody(this.mode);
      case "menu":
        return this.renderMenu(this.mode);
      case "menuDesignTitle":
        return this.renderMenuDesignTitle(this.mode);
      case "menuDesignBody":
        return this.renderMenuDesignBody(this.mode);
      case "menuEdit":
        return this.renderMenuEdit(this.mode);
      case "menuEditLabel":
        return this.renderMenuEditLabel(this.mode);
      case "menuEditDisplayNo":
        return this.renderMenuEditDisplayNo(this.mode);
      case "menuEditDisplayType":
        return this.renderMenuEditDisplayType(this.mode);
      case "menuEditBoardSelect":
        return this.renderMenuEditBoardSelect(this.mode);
      case "menuEditConferenceSelect":
        return this.renderMenuEditConferenceSelect(this.mode);
      case "menuEditLink":
        return this.renderMenuEditLink(this.mode);
      case "menuEditPageTitle":
        return this.renderMenuEditPageTitle(this.mode);
      case "menuEditPageBody":
        return this.renderMenuEditPageBody(this.mode);
      case "menuAddType":
        return this.renderMenuAddType(this.mode);
      case "menuAddLabel":
        return this.renderMenuAddLabel(this.mode);
      case "menuAddBoardSelect":
        return this.renderMenuAddBoardSelect(this.mode);
      case "menuAddConferenceSelect":
        return this.renderMenuAddConferenceSelect(this.mode);
      case "menuAddPageTitle":
        return this.renderMenuAddPageTitle(this.mode);
      case "menuAddPageBody":
        return this.renderMenuAddPageBody(this.mode);
      case "menuAddLink":
        return this.renderMenuAddLink(this.mode);
      case "boardManage":
        return this.renderBoardManage(this.mode);
      case "boardAdd":
        return this.renderBoardAdd(this.mode);
      case "boardRename":
        return this.renderBoardRename(this.mode);
      case "posts":
        return this.renderPosts(this.mode);
      case "post":
        return this.renderPost(this.mode);
      case "writeTitle":
        return this.renderWriteTitle(this.mode);
      case "writeBody":
        return this.renderWriteBody(this.mode);
      case "page":
        return this.renderPage(this.mode);
      case "link":
        return this.renderLink(this.mode);
    }
  }

  private renderConferenceManage(mode: ModeConferenceManage): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push("Conferences:");
    lines.push("");

    for (let i = 0; i < mode.conferences.length; i++) {
      lines.push(`${i + 1}) ${sanitizePlainText(mode.conferences[i]!.name)}`);
    }

    return this.screen({
      title: "test-bbs (Conference Manage)",
      lines,
      prompt: "> ",
      inputMode: "line",
      hints: ["Commands: A=Add  R <n>=Rename  D <n>=Delete  0=Back"],
    });
  }

  private renderConferenceAdd(_mode: ModeConferenceAdd): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push("Add Conference");
    lines.push("");
    lines.push("Enter name (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderConferenceRename(mode: ModeConferenceRename): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push("Rename Conference");
    lines.push("");
    lines.push(`Current: ${sanitizePlainText(mode.conference.name)}`);
    lines.push("Enter new name (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderWelcome(mode: ModeWelcome): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}]`);
    lines.push("");

    if (mode.conference.welcomeTitle) {
      lines.push(sanitizePlainText(mode.conference.welcomeTitle));
      lines.push("");
    }

    if (mode.conference.welcomeBody) {
      lines.push(...wrapText(mode.conference.welcomeBody, this.ctx.cols));
      lines.push("");
    } else if (!mode.conference.welcomeTitle) {
      lines.push("(no welcome message)");
      lines.push("");
    }

    const updatedBy = mode.conference.updatedBy ? sanitizePlainText(mode.conference.updatedBy) : "unknown";
    const updatedAt = formatDate(mode.conference.updatedAt);
    lines.push(`Last updated: ${updatedBy}${updatedAt ? ` @ ${updatedAt}` : ""}`);
    lines.push("");
    lines.push("Press any key to continue.");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderWelcomeEditTitle(mode: ModeWelcomeEditTitle): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Welcome Edit`);
    lines.push("");
    lines.push(`Current title: ${sanitizePlainText(mode.conference.welcomeTitle || "(none)")}`);
    lines.push("");
    lines.push("Enter new title (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderWelcomeEditBody(mode: ModeWelcomeEditBody): ScreenModel {
    const rows = this.ctx.rows;
    const cols = this.ctx.cols;

    const overhead = 10;
    const previewHeight = Math.max(rows - overhead, 5);

    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Welcome Edit`);
    lines.push(`Title: ${sanitizePlainText(mode.title)}`);
    lines.push("");
    lines.push("Enter body. '.' on its own line to finish. '0' to cancel.");
    lines.push("-".repeat(Math.min(cols, 80)));

    const preview = mode.lines.slice(-previewHeight);
    for (const line of preview) {
      for (const wrapped of wrapLine(sanitizePlainText(line), cols)) lines.push(wrapped);
    }

    lines.push("-".repeat(Math.min(cols, 80)));

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "multiline",
    });
  }

  private renderMenuDesignTitle(mode: ModeMenuDesignTitle): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Menu Design`);
    lines.push("");
    lines.push(`Current title: ${sanitizePlainText(mode.conference.menuTitle || "(none)")}`);
    lines.push("Enter new title (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderMenuDesignBody(mode: ModeMenuDesignBody): ScreenModel {
    const rows = this.ctx.rows;
    const cols = this.ctx.cols;

    const overhead = 10;
    const previewHeight = Math.max(rows - overhead, 5);

    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Menu Design`);
    lines.push(`Title: ${sanitizePlainText(mode.title || "(none)")}`);
    lines.push("");
    lines.push("Enter menu text. '.' on its own line to finish. '0' to cancel.");
    lines.push("-".repeat(Math.min(cols, 80)));

    const preview = mode.lines.slice(-previewHeight);
    for (const line of preview) lines.push(sanitizePlainText(line));

    lines.push("-".repeat(Math.min(cols, 80)));

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "multiline",
    });
  }

  private renderMenu(mode: ModeMenu): ScreenModel {
    const menuBody = mode.conference.menuBody ?? "";
    const hasMenuBody = menuBody.trim().length > 0;
    if (hasMenuBody) {
      return this.screen({
        title: "test-bbs",
        lines: splitPlainLines(menuBody),
        prompt: "> ",
        inputMode: "line",
      });
    }

    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");

    const menuTitle = mode.conference.menuTitle ? sanitizePlainText(mode.conference.menuTitle) : "Menu";
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] ${menuTitle}`);
    lines.push("");

    const visibleEntries: { index: number; item: ConferenceMenuItem }[] = [];
    for (let i = 0; i < mode.items.length; i++) {
      const item = mode.items[i]!;
      if (!item.hidden) visibleEntries.push({ index: i + 1, item });
    }

    if (visibleEntries.length === 0) {
      lines.push("(no menu items)");
    } else {
      for (const entry of visibleEntries) {
        const item = entry.item;
        const label = sanitizePlainText(item.label);
        const displayNo = sanitizePlainText(item.displayNo);
        const displayType = sanitizePlainText(item.displayType);
        const parts = [displayNo, label, displayType].filter((part) => part.length > 0);
        const detail = parts.length ? parts.join(" ") : label;
        lines.push(`${entry.index}) ${detail}`);
      }
    }

    const backLabel = mode.conference.isRoot ? "Exit" : "Back";
    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
      hints: [`Commands: <num>=Open  0=${backLabel}`],
    });
  }

  private renderMenuEdit(mode: ModeMenuEdit): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Menu Edit`);
    lines.push("");

    if (mode.items.length === 0) {
      lines.push("(no menu items)");
    } else {
      for (let i = 0; i < mode.items.length; i++) {
        const item = mode.items[i]!;
        const label = sanitizePlainText(item.label);
        const status = item.hidden ? "hidden" : "show";
        const displayNo = item.displayNo ? `no=${sanitizePlainText(item.displayNo)}` : "no=-";
        const displayType = item.displayType ? `type=${sanitizePlainText(item.displayType)}` : "type=-";
        const detail =
          item.actionType === "board"
            ? `board:${item.actionRef}`
            : item.actionType === "page"
              ? `page:${sanitizePlainText(item.actionRef || "-")}`
              : item.actionType === "conference"
                ? `conference:${item.actionRef}`
                : `link:${sanitizePlainText(item.actionRef)}`;
        lines.push(`${i + 1}) [${status}] ${displayNo} ${displayType} ${label} (${detail})`);
      }
    }

    const hints = [
      "Commands: A=Add  L <n>=Label  N <n>=No  Y <n>=Type  U <n>=Target  H <n>=Hide  D <n>=Delete  M <from> <to>=Move  0=Back",
    ];
    if (!mode.conference.isRoot) hints.push("Extra: B=Boards");
    if (mode.conference.isRoot) hints.push("Extra: C=Conferences");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
      hints,
    });
  }

  private renderMenuEditLabel(mode: ModeMenuEditLabel): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Edit Label`);
    lines.push(`Current: ${sanitizePlainText(mode.item.label)}`);
    lines.push("Enter new label (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderMenuEditDisplayNo(mode: ModeMenuEditDisplayNo): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Edit Display No`);
    lines.push(`Current: ${sanitizePlainText(mode.item.displayNo || "(none)")}`);
    lines.push("Enter new display number (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderMenuEditDisplayType(mode: ModeMenuEditDisplayType): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Edit Display Type`);
    lines.push(`Current: ${sanitizePlainText(mode.item.displayType || "(none)")}`);
    lines.push("Enter new display type (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderMenuEditBoardSelect(mode: ModeMenuEditBoardSelect): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Edit Board Target`);
    lines.push(`Label: ${sanitizePlainText(mode.item.label)}`);
    lines.push("");
    lines.push("Select a board:");
    lines.push("");

    for (let i = 0; i < mode.boards.length; i++) {
      lines.push(`${i + 1}) ${sanitizePlainText(mode.boards[i]!.name)}`);
    }
    lines.push("0) Cancel");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderMenuEditConferenceSelect(mode: ModeMenuEditConferenceSelect): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Edit Conference Target`);
    lines.push(`Label: ${sanitizePlainText(mode.item.label)}`);
    lines.push("");
    lines.push("Select a conference:");
    lines.push("");

    for (let i = 0; i < mode.conferences.length; i++) {
      lines.push(`${i + 1}) ${sanitizePlainText(mode.conferences[i]!.name)}`);
    }
    lines.push("0) Cancel");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderMenuEditLink(mode: ModeMenuEditLink): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Edit Link`);
    lines.push(`Current: ${sanitizePlainText(mode.item.actionRef)}`);
    lines.push("Enter new URL (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderMenuEditPageTitle(mode: ModeMenuEditPageTitle): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Edit Page`);
    lines.push(`Current title: ${sanitizePlainText(mode.item.actionRef || "(none)")}`);
    lines.push("Enter new title (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderMenuEditPageBody(mode: ModeMenuEditPageBody): ScreenModel {
    const rows = this.ctx.rows;
    const cols = this.ctx.cols;

    const overhead = 10;
    const previewHeight = Math.max(rows - overhead, 5);

    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Edit Page`);
    lines.push(`Title: ${sanitizePlainText(mode.title)}`);
    lines.push("");
    lines.push("Enter body. '.' on its own line to finish. '0' to cancel.");
    lines.push("-".repeat(Math.min(cols, 80)));

    const preview = mode.lines.slice(-previewHeight);
    for (const line of preview) {
      for (const wrapped of wrapLine(sanitizePlainText(line), cols)) lines.push(wrapped);
    }

    lines.push("-".repeat(Math.min(cols, 80)));

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "multiline",
    });
  }

  private renderMenuAddType(mode: ModeMenuAddType): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Add Menu Item`);
    lines.push("");
    lines.push("Select type:");
    lines.push("B) Board");
    lines.push("P) Page");
    lines.push("L) Link");
    lines.push("C) Conference");
    lines.push("0) Cancel");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderMenuAddLabel(mode: ModeMenuAddLabel): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Add Menu Item`);
    lines.push("");
    lines.push(`Type: ${mode.actionType}`);
    lines.push("Enter label (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderMenuAddBoardSelect(mode: ModeMenuAddBoardSelect): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Add Menu Item`);
    lines.push(`Label: ${sanitizePlainText(mode.label)}`);
    lines.push("");
    lines.push("Select a board:");
    lines.push("");

    for (let i = 0; i < mode.boards.length; i++) {
      lines.push(`${i + 1}) ${sanitizePlainText(mode.boards[i]!.name)}`);
    }
    lines.push("0) Cancel");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderMenuAddConferenceSelect(mode: ModeMenuAddConferenceSelect): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Add Menu Item`);
    lines.push(`Label: ${sanitizePlainText(mode.label)}`);
    lines.push("");
    lines.push("Select a conference:");
    lines.push("");

    for (let i = 0; i < mode.conferences.length; i++) {
      lines.push(`${i + 1}) ${sanitizePlainText(mode.conferences[i]!.name)}`);
    }
    lines.push("0) Cancel");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderMenuAddPageTitle(mode: ModeMenuAddPageTitle): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Add Page`);
    lines.push(`Label: ${sanitizePlainText(mode.label)}`);
    lines.push("");
    lines.push("Enter page title (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderMenuAddPageBody(mode: ModeMenuAddPageBody): ScreenModel {
    const rows = this.ctx.rows;
    const cols = this.ctx.cols;

    const overhead = 10;
    const previewHeight = Math.max(rows - overhead, 5);

    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Add Page`);
    lines.push(`Label: ${sanitizePlainText(mode.label)}`);
    lines.push(`Title: ${sanitizePlainText(mode.title)}`);
    lines.push("");
    lines.push("Enter body. '.' on its own line to finish. '0' to cancel.");
    lines.push("-".repeat(Math.min(cols, 80)));

    const preview = mode.lines.slice(-previewHeight);
    for (const line of preview) {
      for (const wrapped of wrapLine(sanitizePlainText(line), cols)) lines.push(wrapped);
    }

    lines.push("-".repeat(Math.min(cols, 80)));

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "multiline",
    });
  }

  private renderMenuAddLink(mode: ModeMenuAddLink): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Add Link`);
    lines.push(`Label: ${sanitizePlainText(mode.label)}`);
    lines.push("");
    lines.push("Enter URL (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderBoardManage(mode: ModeBoardManage): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Board Manage`);
    lines.push("");

    if (mode.boards.length === 0) {
      lines.push("(no boards)");
    } else {
      for (let i = 0; i < mode.boards.length; i++) {
        lines.push(`${i + 1}) ${sanitizePlainText(mode.boards[i]!.name)}`);
      }
    }

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
      hints: ["Commands: A=Add  R <n>=Rename  D <n>=Delete  0=Back"],
    });
  }

  private renderBoardAdd(mode: ModeBoardAdd): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Add Board`);
    lines.push("");
    lines.push("Enter board name (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderBoardRename(mode: ModeBoardRename): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Rename Board`);
    lines.push("");
    lines.push(`Current: ${sanitizePlainText(mode.board.name)}`);
    lines.push("Enter new name (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderPosts(mode: ModePosts): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(
      `[Conference: ${sanitizePlainText(mode.conference.name)}] [Board: ${sanitizePlainText(mode.board.name)}] Page ${mode.page}`,
    );
    lines.push("");

    if (mode.posts.length === 0) {
      lines.push("(no posts)");
    } else {
      for (const post of mode.posts) {
        lines.push(
          `${post.id}\t${sanitizePlainText(post.title)}\t(${sanitizePlainText(post.author)}, ${formatDate(post.createdAt)})`,
        );
      }
    }

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
      hints: ["Commands: N=Next  P=Prev  R <id>=Read  W=Write  0=Menu"],
    });
  }

  private renderPost(mode: ModePost): ScreenModel {
    const rows = this.ctx.rows;
    const cols = this.ctx.cols;

    const overhead = 9;
    const bodyHeight = Math.max(rows - overhead, 5);
    const wrappedBody = wrapText(mode.post.body, cols);
    const pages = chunk(wrappedBody, bodyHeight);
    const totalPages = pages.length;

    let page = mode.page;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    if (page !== mode.page) {
      this.mode = { ...mode, page };
      this.toast = "End of post.";
    }

    const pageIndex = Math.max(0, page - 1);

    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(
      `[Conference: ${sanitizePlainText(mode.conference.name)}] [Board: ${sanitizePlainText(mode.board.name)}] Post #${mode.post.id} (${page}/${totalPages})`,
    );
    lines.push(`Title: ${sanitizePlainText(mode.post.title)}`);
    lines.push(`Author: ${sanitizePlainText(mode.post.author)}`);
    lines.push(`Date: ${formatDate(mode.post.createdAt)}`);
    lines.push("-".repeat(Math.min(cols, 80)));
    for (const line of pages[pageIndex] ?? []) lines.push(line);
    lines.push("-".repeat(Math.min(cols, 80)));

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
      hints: ["Commands: N=Next page  P=Prev page  0=Back"],
    });
  }

  private renderWriteTitle(mode: ModeWriteTitle): ScreenModel {
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(
      `[Conference: ${sanitizePlainText(mode.conference.name)}] [Board: ${sanitizePlainText(mode.board.name)}] Write Post`,
    );
    lines.push("");
    lines.push("Enter title (0 to cancel):");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
    });
  }

  private renderWriteBody(mode: ModeWriteBody): ScreenModel {
    const rows = this.ctx.rows;
    const cols = this.ctx.cols;

    const overhead = 10;
    const previewHeight = Math.max(rows - overhead, 5);

    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(
      `[Conference: ${sanitizePlainText(mode.conference.name)}] [Board: ${sanitizePlainText(mode.board.name)}] Write Post`,
    );
    lines.push(`Title: ${sanitizePlainText(mode.title)}`);
    lines.push("");
    lines.push("Enter body. '.' on its own line to finish. '0' to cancel.");
    lines.push("-".repeat(Math.min(cols, 80)));

    const preview = mode.lines.slice(-previewHeight);
    for (const line of preview) {
      for (const wrapped of wrapLine(sanitizePlainText(line), cols)) lines.push(wrapped);
    }

    lines.push("-".repeat(Math.min(cols, 80)));

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "multiline",
    });
  }

  private renderPage(mode: ModePage): ScreenModel {
    const rows = this.ctx.rows;
    const cols = this.ctx.cols;

    const overhead = 9;
    const bodyHeight = Math.max(rows - overhead, 5);
    const wrappedBody = wrapText(mode.item.body, cols);
    const pages = chunk(wrappedBody, bodyHeight);
    const totalPages = pages.length;

    let page = mode.page;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    if (page !== mode.page) {
      this.mode = { ...mode, page };
      this.toast = "End of page.";
    }

    const pageIndex = Math.max(0, page - 1);
    const pageTitle = sanitizePlainText(mode.item.actionRef || mode.item.label);

    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Page (${page}/${totalPages})`);
    lines.push(`Title: ${pageTitle}`);
    lines.push("-".repeat(Math.min(cols, 80)));
    for (const line of pages[pageIndex] ?? []) lines.push(line);
    lines.push("-".repeat(Math.min(cols, 80)));

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
      hints: ["Commands: N=Next page  P=Prev page  0=Back"],
    });
  }

  private renderLink(mode: ModeLink): ScreenModel {
    const cols = this.ctx.cols;
    const lines: string[] = [];
    lines.push(`user=${sanitizePlainText(this.ctx.user)}`);
    lines.push("");
    lines.push(`[Conference: ${sanitizePlainText(mode.conference.name)}] Link`);
    lines.push(`Label: ${sanitizePlainText(mode.item.label)}`);
    lines.push("URL:");
    for (const wrapped of wrapLine(sanitizePlainText(mode.item.actionRef), cols)) lines.push(wrapped);
    lines.push("");
    lines.push("Open this URL in your browser.");

    return this.screen({
      title: "test-bbs",
      lines,
      prompt: "> ",
      inputMode: "line",
      hints: ["Commands: 0=Back"],
    });
  }
}
