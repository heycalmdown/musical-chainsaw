import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { monotonicFactory } from "ulid";
import type {
  Board,
  Conference,
  ConferenceMenuItem,
  Post,
  PostSummary,
} from "./domain";
import type { DbConfig } from "./config";

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

  getDocumentClient(): DynamoDBDocumentClient;
  getTableName(): string;
}

export async function createBbsDb(config: DbConfig): Promise<BbsDb> {
  const db = new DynamoBbsDb(config.dynamodb);
  await db.init();
  return db;
}

function nowIso(): string {
  return new Date().toISOString();
}

const ID_PAD_WIDTH = 12;

function padId(value: string | number): string {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return String(value);
  return String(Math.trunc(num)).padStart(ID_PAD_WIDTH, "0");
}

const createUlid = monotonicFactory();

function generateUlid(): string {
  return createUlid();
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
    if (data && typeof data === "object")
      return data as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

const GS1_NAME = "GS1";
const CONFERENCE_PARTITION = "CONF";

function conferenceItemPk(): string {
  return CONFERENCE_PARTITION;
}

function conferenceItemSk(id: string): string {
  return `CONF#${id}`;
}

function conferenceMenuPk(id: string): string {
  return `CONF#${id}`;
}

function boardPk(_: string, boardId: string): string {
  return `BOARD#${boardId}`;
}

function menuSk(menuItemId: string): string {
  return `MENU#${padId(menuItemId)}`;
}

function postSk(postId: string): string {
  return `POST#${postId}`;
}

function boardGsPk(conferenceId: string): string {
  return `CONF#${conferenceId}`;
}

function boardGsSk(boardId: string): string {
  return `BOARD#${padId(boardId)}`;
}

function postGsPk(postId: string): string {
  return `POST#${postId}`;
}

type DdbConferenceItem = {
  PK: string;
  SK: string;
  entityType: "CONFERENCE";
  id: string;
  slug?: string | null;
  name: string;
  is_root: number;
  welcome_title: string;
  welcome_body: string;
  menu_title: string;
  menu_body: string;
  updated_at: string;
  updated_by: string;
};

type DdbMenuItemRecord = {
  PK: string;
  SK: string;
  entityType: "MENU_ITEM";
  conference_id: string;
  menu_item_id: string;
  label: string;
  display_no: string;
  display_type: string;
  action_type: ConferenceMenuItem["actionType"];
  action_ref: string;
  body: string;
  hidden: number;
  enabled?: number;
  updated_at: string;
  updated_by: string;
};

type DdbBoardItem = {
  PK: string;
  SK: string;
  GS1PK?: string;
  GS1SK?: string;
  entityType: "BOARD";
  id: string;
  name: string;
  conference_id: string;
};

type DdbPostItem = {
  PK: string;
  SK: string;
  GS1PK?: string;
  GS1SK?: string;
  entityType: "POST";
  post_id: string;
  board_id: string;
  conference_id: string;
  title: string;
  body: string;
  author: string;
  created_at: string;
};

type DdbWriteRequest = {
  DeleteRequest?: {
    Key: Record<string, unknown>;
  };
  PutRequest?: {
    Item: Record<string, unknown>;
  };
};

function mapConferenceItem(item: DdbConferenceItem): Conference {
  return {
    id: item.id,
    slug: item.slug ?? null,
    name: item.name,
    isRoot: item.is_root === 1,
    welcomeTitle: item.welcome_title ?? "",
    welcomeBody: item.welcome_body ?? "",
    menuTitle: item.menu_title ?? "",
    menuBody: item.menu_body ?? "",
    updatedAt: item.updated_at ?? "",
    updatedBy: item.updated_by ?? "",
  };
}

function mapMenuItem(item: DdbMenuItemRecord): ConferenceMenuItem {
  return {
    id: item.menu_item_id,
    conferenceId: item.conference_id,
    label: item.label,
    displayNo: item.display_no,
    displayType: item.display_type,
    actionType: item.action_type,
    actionRef: item.action_ref,
    body: item.body,
    hidden: Boolean(item.hidden),
    updatedAt: item.updated_at ?? "",
    updatedBy: item.updated_by ?? "",
  };
}

function mapBoardItem(item: DdbBoardItem): Board {
  return {
    id: item.id,
    name: item.name,
    conferenceId: item.conference_id,
  };
}

function mapPostSummaryItem(item: DdbPostItem): PostSummary {
  return {
    id: item.post_id,
    title: item.title,
    author: item.author,
    createdAt: item.created_at,
  };
}

function mapPostItem(item: DdbPostItem): Post {
  return {
    id: item.post_id,
    conferenceId: item.conference_id,
    boardId: item.board_id,
    title: item.title,
    body: item.body,
    author: item.author,
    createdAt: item.created_at,
  };
}

class DynamoBbsDb implements BbsDb {
  private readonly client: DynamoDBDocumentClient;
  private readonly rawClient: DynamoDBClient;
  private readonly tableName: string;

  constructor(options: {
    tableName: string;
    region: string;
    endpoint?: string;
  }) {
    console.log("options", options);
    this.rawClient = new DynamoDBClient({
      region: options.region,
      endpoint: options.endpoint,
    });
    this.client = DynamoDBDocumentClient.from(this.rawClient, {
      marshallOptions: { removeUndefinedValues: true },
    });
    this.tableName = options.tableName;
  }

  async init(): Promise<void> {
    await this.seedDefaults();
  }

  private async seedDefaults(): Promise<void> {
    const now = nowIso();

    const root = await this.getRootConference();
    let rootId = root?.id;
    if (!rootId) {
      rootId = "0";
      await this.putConferenceItem({
        id: rootId,
        slug: "root",
        name: "Lobby",
        isRoot: true,
        welcomeTitle: "Welcome",
        welcomeBody: "",
        menuTitle: "Menu",
        menuBody: "",
        updatedAt: now,
        updatedBy: "system",
      });
    }

    const defaultConference = await this.getDefaultConference();
    let conferenceId = defaultConference?.id;
    if (!conferenceId) {
      conferenceId = await this.nextConferenceId();
      await this.putConferenceItem({
        id: conferenceId,
        slug: "main",
        name: "Main",
        isRoot: false,
        welcomeTitle: "Welcome",
        welcomeBody: "",
        menuTitle: "Menu",
        menuBody: "",
        updatedAt: now,
        updatedBy: "system",
      });
    }

    const boards = await this.listBoards(conferenceId);
    if (boards.length === 0) {
      await this.createBoard({ conferenceId, name: "General" });
    }

    const menuItems = await this.listMenuItems(conferenceId);
    if (menuItems.length === 0) {
      const updatedBoards = await this.listBoards(conferenceId);
      for (const board of updatedBoards) {
        await this.createMenuItem({
          conferenceId,
          label: board.name,
          displayNo: "",
          displayType: "",
          actionType: "board",
          actionRef: board.id,
          body: "",
          hidden: false,
          updatedBy: "system",
        });
      }
    }

    if (rootId) {
      const rootMenuItems = await this.listMenuItems(rootId);
      if (rootMenuItems.length === 0) {
        const conferences = await this.listConferences();
        if (conferences.length > 0) {
          const first = conferences[0]!;
          await this.createMenuItem({
            conferenceId: rootId,
            label: first.name,
            displayNo: "",
            displayType: "",
            actionType: "conference",
            actionRef: first.id,
            body: "",
            hidden: false,
            updatedBy: "system",
          });
        }
      }
    }
  }

  private async putConferenceItem(args: {
    id: string;
    slug: string | null;
    name: string;
    isRoot: boolean;
    welcomeTitle: string;
    welcomeBody: string;
    menuTitle: string;
    menuBody: string;
    updatedAt: string;
    updatedBy: string;
  }): Promise<void> {
    const item: DdbConferenceItem = {
      PK: conferenceItemPk(),
      SK: conferenceItemSk(args.id),
      entityType: "CONFERENCE",
      id: args.id,
      slug: args.slug,
      name: args.name,
      is_root: args.isRoot ? 1 : 0,
      welcome_title: args.welcomeTitle,
      welcome_body: args.welcomeBody,
      menu_title: args.menuTitle,
      menu_body: args.menuBody,
      updated_at: args.updatedAt,
      updated_by: args.updatedBy,
    };
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: "attribute_not_exists(PK)",
        }),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "name" in error &&
        error.name === "ConditionalCheckFailedException"
      )
        return;
      throw error;
    }
  }

  private async getDefaultConference(): Promise<Conference | null> {
    const conferences = await this.listConferences();
    return conferences.length > 0 ? conferences[0]! : null;
  }

  private async queryAllItems<T>(params: {
    TableName: string;
    IndexName?: string;
    KeyConditionExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
    ExpressionAttributeNames?: Record<string, string>;
    FilterExpression?: string;
    ScanIndexForward?: boolean;
  }): Promise<T[]> {
    const items: T[] = [];
    let lastKey: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(
        new QueryCommand({
          ...params,
          ExclusiveStartKey: lastKey,
        }),
      );
      const pageItems = (result.Items ?? []) as T[];
      items.push(...pageItems);
      lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);
    return items;
  }

  private async batchDelete(
    keys: Array<{ PK: string; SK: string }>,
  ): Promise<void> {
    const batches: Array<Array<{ PK: string; SK: string }>> = [];
    for (let i = 0; i < keys.length; i += 25) {
      batches.push(keys.slice(i, i + 25));
    }

    for (const batch of batches) {
      let unprocessed: DdbWriteRequest[] = batch.map((key) => ({
        DeleteRequest: { Key: key },
      }));
      let attempts = 0;
      while (unprocessed.length > 0 && attempts < 5) {
        const result = await this.client.send(
          new BatchWriteCommand({
            RequestItems: {
              [this.tableName]: unprocessed,
            },
          }),
        );
        unprocessed =
          (result.UnprocessedItems?.[this.tableName] as DdbWriteRequest[]) ??
          [];
        attempts += 1;
      }
    }
  }

  private async listMenuItemRecords(
    conferenceId: string,
  ): Promise<DdbMenuItemRecord[]> {
    return this.queryAllItems<DdbMenuItemRecord>({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": conferenceMenuPk(conferenceId),
        ":prefix": "MENU#",
      },
      ScanIndexForward: true,
    });
  }

  private async nextConferenceId(): Promise<string> {
    const items = await this.queryAllItems<DdbConferenceItem>({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": conferenceItemPk(),
        ":prefix": "CONF#",
      },
      ScanIndexForward: true,
    });
    let max = 0;
    for (const item of items) {
      if (item.id === "0") continue;
      const num = Number(item.id);
      if (Number.isFinite(num) && num > max) max = Math.trunc(num);
    }
    return String(max + 1);
  }

  private async nextMenuItemId(conferenceId: string): Promise<string> {
    const latest = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
          ":pk": conferenceMenuPk(conferenceId),
          ":prefix": "MENU#",
        },
        ScanIndexForward: false,
        Limit: 1,
      }),
    );
    const max = Number(
      (latest.Items?.[0] as DdbMenuItemRecord | undefined)?.menu_item_id,
    );
    const next = Number.isFinite(max) && max > 0 ? Math.trunc(max) + 1 : 1;
    return String(next);
  }

  private async fetchMenuItemRecord(
    conferenceId: string,
    menuItemId: string,
  ): Promise<DdbMenuItemRecord | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        FilterExpression: "menu_item_id = :menuId",
        ExpressionAttributeValues: {
          ":pk": conferenceMenuPk(conferenceId),
          ":prefix": "MENU#",
          ":menuId": menuItemId,
        },
        Limit: 1,
      }),
    );
    const item = (result.Items?.[0] as DdbMenuItemRecord | undefined) ?? null;
    return item;
  }

  async listConferences(): Promise<Conference[]> {
    const items = await this.queryAllItems<DdbConferenceItem>({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      FilterExpression: "is_root = :zero",
      ExpressionAttributeValues: {
        ":pk": conferenceItemPk(),
        ":prefix": "CONF#",
        ":zero": 0,
      },
      ScanIndexForward: true,
    });
    return items.map(mapConferenceItem);
  }

  async getConference(conferenceId: string): Promise<Conference | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: conferenceItemPk(),
          SK: conferenceItemSk(conferenceId),
        },
      }),
    );
    const item = result.Item as DdbConferenceItem | undefined;
    return item ? mapConferenceItem(item) : null;
  }

  async getRootConference(): Promise<Conference | null> {
    console.log("table", this.tableName);
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: conferenceItemPk(), SK: conferenceItemSk("0") },
      }),
    );
    const item = result.Item as DdbConferenceItem | undefined;
    return item ? mapConferenceItem(item) : null;
  }

  async updateConferenceWelcome(args: {
    conferenceId: string;
    title: string;
    body: string;
    updatedBy: string;
  }): Promise<void> {
    const updatedAt = nowIso();
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: conferenceItemPk(),
          SK: conferenceItemSk(args.conferenceId),
        },
        UpdateExpression:
          "SET welcome_title = :title, welcome_body = :body, updated_at = :updatedAt, updated_by = :updatedBy",
        ExpressionAttributeValues: {
          ":title": args.title,
          ":body": args.body,
          ":updatedAt": updatedAt,
          ":updatedBy": args.updatedBy,
        },
      }),
    );
  }

  async updateConferenceMenu(args: {
    conferenceId: string;
    title: string;
    body: string;
    updatedBy: string;
  }): Promise<void> {
    const updatedAt = nowIso();
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: conferenceItemPk(),
          SK: conferenceItemSk(args.conferenceId),
        },
        UpdateExpression:
          "SET menu_title = :title, menu_body = :body, updated_at = :updatedAt, updated_by = :updatedBy",
        ExpressionAttributeValues: {
          ":title": args.title,
          ":body": args.body,
          ":updatedAt": updatedAt,
          ":updatedBy": args.updatedBy,
        },
      }),
    );
  }

  async createConference(args: {
    name: string;
    updatedBy: string;
  }): Promise<string> {
    const id = await this.nextConferenceId();
    const updatedAt = nowIso();

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: conferenceItemPk(),
          SK: conferenceItemSk(id),
          entityType: "CONFERENCE",
          id,
          slug: null,
          name: args.name,
          is_root: 0,
          welcome_title: "Welcome",
          welcome_body: "",
          menu_title: "Menu",
          menu_body: "",
          updated_at: updatedAt,
          updated_by: args.updatedBy,
        } as DdbConferenceItem,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return id;
  }

  async renameConference(args: {
    conferenceId: string;
    name: string;
    updatedBy: string;
  }): Promise<boolean> {
    const updatedAt = nowIso();
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            PK: conferenceItemPk(),
            SK: conferenceItemSk(args.conferenceId),
          },
          UpdateExpression:
            "SET #name = :name, updated_at = :updatedAt, updated_by = :updatedBy",
          ConditionExpression: "attribute_exists(PK) AND is_root = :zero",
          ExpressionAttributeNames: { "#name": "name" },
          ExpressionAttributeValues: {
            ":name": args.name,
            ":updatedAt": updatedAt,
            ":updatedBy": args.updatedBy,
            ":zero": 0,
          },
        }),
      );
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        "name" in error &&
        error.name === "ConditionalCheckFailedException"
      )
        return false;
      throw error;
    }
  }

  async deleteConference(args: { conferenceId: string }): Promise<boolean> {
    const conference = await this.getConference(args.conferenceId);
    if (!conference || conference.isRoot) return false;

    const menuItems = await this.listMenuItemRecords(args.conferenceId);
    if (menuItems.length > 0) {
      await this.batchDelete(
        menuItems.map((item) => ({ PK: item.PK, SK: item.SK })),
      );
    }

    const boards = await this.listBoards(args.conferenceId);
    for (const board of boards) {
      await this.deleteBoard({
        conferenceId: args.conferenceId,
        boardId: board.id,
      });
    }

    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: conferenceItemPk(),
          SK: conferenceItemSk(args.conferenceId),
        },
      }),
    );
    return true;
  }

  async listMenuItems(conferenceId: string): Promise<ConferenceMenuItem[]> {
    const items = await this.listMenuItemRecords(conferenceId);
    return items.map(mapMenuItem);
  }

  async getMenuItem(args: {
    conferenceId: string;
    menuItemId: string;
  }): Promise<ConferenceMenuItem | null> {
    const item = await this.fetchMenuItemRecord(
      args.conferenceId,
      args.menuItemId,
    );
    return item ? mapMenuItem(item) : null;
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
    const id = await this.nextMenuItemId(args.conferenceId);
    const updatedAt = nowIso();
    const item: DdbMenuItemRecord = {
      PK: conferenceMenuPk(args.conferenceId),
      SK: menuSk(id),
      entityType: "MENU_ITEM",
      conference_id: args.conferenceId,
      menu_item_id: id,
      label: args.label,
      display_no: args.displayNo,
      display_type: args.displayType,
      action_type: args.actionType,
      action_ref: args.actionRef,
      body: args.body,
      hidden: args.hidden ? 1 : 0,
      enabled: args.hidden ? 0 : 1,
      updated_at: updatedAt,
      updated_by: args.updatedBy,
    };
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression:
          "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );
    return id;
  }

  async deleteMenuItem(args: {
    conferenceId: string;
    menuItemId: string;
  }): Promise<boolean> {
    const record = await this.fetchMenuItemRecord(
      args.conferenceId,
      args.menuItemId,
    );
    if (!record) return false;
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: record.PK, SK: record.SK },
      }),
    );
    return true;
  }

  async setMenuItemHidden(args: {
    conferenceId: string;
    menuItemId: string;
    hidden: boolean;
    updatedBy: string;
  }): Promise<boolean> {
    const record = await this.fetchMenuItemRecord(
      args.conferenceId,
      args.menuItemId,
    );
    if (!record) return false;
    const updatedAt = nowIso();
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: record.PK, SK: record.SK },
        UpdateExpression:
          "SET hidden = :hidden, enabled = :enabled, updated_at = :updatedAt, updated_by = :updatedBy",
        ExpressionAttributeValues: {
          ":hidden": args.hidden ? 1 : 0,
          ":enabled": args.hidden ? 0 : 1,
          ":updatedAt": updatedAt,
          ":updatedBy": args.updatedBy,
        },
      }),
    );
    return true;
  }

  async updateMenuItemMeta(args: {
    conferenceId: string;
    menuItemId: string;
    label: string;
    displayNo: string;
    displayType: string;
    updatedBy: string;
  }): Promise<boolean> {
    const record = await this.fetchMenuItemRecord(
      args.conferenceId,
      args.menuItemId,
    );
    if (!record) return false;
    const updatedAt = nowIso();
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: record.PK, SK: record.SK },
        UpdateExpression:
          "SET label = :label, display_no = :displayNo, display_type = :displayType, updated_at = :updatedAt, updated_by = :updatedBy",
        ExpressionAttributeValues: {
          ":label": args.label,
          ":displayNo": args.displayNo,
          ":displayType": args.displayType,
          ":updatedAt": updatedAt,
          ":updatedBy": args.updatedBy,
        },
      }),
    );
    return true;
  }

  async updateMenuItemContent(args: {
    conferenceId: string;
    menuItemId: string;
    actionRef: string;
    body: string;
    updatedBy: string;
  }): Promise<boolean> {
    const record = await this.fetchMenuItemRecord(
      args.conferenceId,
      args.menuItemId,
    );
    if (!record) return false;
    const updatedAt = nowIso();
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: record.PK, SK: record.SK },
        UpdateExpression:
          "SET action_ref = :actionRef, body = :body, updated_at = :updatedAt, updated_by = :updatedBy",
        ExpressionAttributeValues: {
          ":actionRef": args.actionRef,
          ":body": args.body,
          ":updatedAt": updatedAt,
          ":updatedBy": args.updatedBy,
        },
      }),
    );
    return true;
  }

  async getBoard(conferenceId: string, boardId: string): Promise<Board | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: boardPk(conferenceId, boardId), SK: "BOARD" },
      }),
    );
    const item = result.Item as DdbBoardItem | undefined;
    return item ? mapBoardItem(item) : null;
  }

  async listBoards(conferenceId: string): Promise<Board[]> {
    const items = await this.queryAllItems<DdbBoardItem>({
      TableName: this.tableName,
      IndexName: GS1_NAME,
      KeyConditionExpression: "GS1PK = :pk AND begins_with(GS1SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": boardGsPk(conferenceId),
        ":prefix": "BOARD#",
      },
      ScanIndexForward: true,
    });
    return items.map(mapBoardItem);
  }

  async createBoard(args: {
    conferenceId: string;
    name: string;
  }): Promise<string> {
    const id = generateUlid();
    const item: DdbBoardItem = {
      PK: boardPk(args.conferenceId, id),
      SK: "BOARD",
      GS1PK: boardGsPk(args.conferenceId),
      GS1SK: boardGsSk(id),
      entityType: "BOARD",
      id,
      name: args.name,
      conference_id: args.conferenceId,
    };
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return id;
  }

  async renameBoard(args: {
    conferenceId: string;
    boardId: string;
    name: string;
  }): Promise<boolean> {
    const board = await this.getBoard(args.conferenceId, args.boardId);
    if (!board || board.conferenceId !== args.conferenceId) return false;
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: boardPk(args.conferenceId, args.boardId), SK: "BOARD" },
        UpdateExpression: "SET #name = :name",
        ExpressionAttributeNames: { "#name": "name" },
        ExpressionAttributeValues: { ":name": args.name },
      }),
    );
    return true;
  }

  async deleteBoard(args: {
    conferenceId: string;
    boardId: string;
  }): Promise<boolean> {
    const board = await this.getBoard(args.conferenceId, args.boardId);
    if (!board || board.conferenceId !== args.conferenceId) return false;

    const posts = await this.queryAllItems<DdbPostItem>({
      TableName: this.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": boardPk(args.conferenceId, args.boardId),
        ":prefix": "POST#",
      },
    });
    if (posts.length > 0) {
      await this.batchDelete(
        posts.map((post) => ({ PK: post.PK, SK: post.SK })),
      );
    }

    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: boardPk(args.conferenceId, args.boardId), SK: "BOARD" },
      }),
    );
    return true;
  }

  async listPosts(args: ListPostsInput): Promise<PostsPage> {
    const pageSize = Math.max(1, Math.trunc(args.pageSize));
    const exclusiveStartKey = decodeCursor(args.cursor ?? null) ?? undefined;
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
          ":pk": boardPk(args.conferenceId, args.boardId),
          ":prefix": "POST#",
        },
        ScanIndexForward: false,
        Limit: pageSize,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = (result.Items ?? []) as DdbPostItem[];
    const nextCursor = result.LastEvaluatedKey
      ? encodeCursor(result.LastEvaluatedKey as Record<string, unknown>)
      : null;

    return {
      posts: items.map(mapPostSummaryItem),
      nextCursor,
    };
  }

  async getPost(postId: string): Promise<Post | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: GS1_NAME,
        KeyConditionExpression: "GS1PK = :pk",
        ExpressionAttributeValues: { ":pk": postGsPk(postId) },
        Limit: 1,
      }),
    );
    const item = result.Items?.[0] as DdbPostItem | undefined;
    return item ? mapPostItem(item) : null;
  }

  async createPost(args: {
    conferenceId: string;
    boardId: string;
    title: string;
    body: string;
    author: string;
  }): Promise<string> {
    const id = generateUlid();
    const createdAt = nowIso();
    const item: DdbPostItem = {
      PK: boardPk(args.conferenceId, args.boardId),
      SK: postSk(id),
      GS1PK: postGsPk(id),
      GS1SK: "POST",
      entityType: "POST",
      post_id: id,
      board_id: args.boardId,
      conference_id: args.conferenceId,
      title: args.title,
      body: args.body,
      author: args.author,
      created_at: createdAt,
    };
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression:
          "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      }),
    );
    return id;
  }

  async close(): Promise<void> {
    this.rawClient.destroy();
  }

  getDocumentClient(): DynamoDBDocumentClient {
    return this.client;
  }

  getTableName(): string {
    return this.tableName;
  }
}
