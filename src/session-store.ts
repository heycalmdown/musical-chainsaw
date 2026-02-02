import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

export type SerializedSessionState = {
  ctx: {
    user: string;
    rows: number;
    cols: number;
    postsPageSize: number;
  };
  mode: unknown;
  toast: string | undefined;
  rootConferenceId: string | null;
};

export type SessionData = {
  id: string;
  nickname: string;
  term: { rows: number; cols: number };
  state: SerializedSessionState;
  createdAtMs: number;
  lastActiveAtMs: number;
  version: number;
};

export interface SessionStore {
  get(sessionId: string): Promise<SessionData | null>;

  create(args: {
    sessionId: string;
    nickname: string;
    term: { rows: number; cols: number };
    state: SerializedSessionState;
    ttlMs: number;
  }): Promise<SessionData>;

  update(args: {
    sessionId: string;
    state: SerializedSessionState;
    expectedVersion: number;
    ttlMs: number;
  }): Promise<SessionData>;

  delete(sessionId: string): Promise<boolean>;
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

type DdbSessionItem = {
  PK: string;
  SK: string;
  entityType: "SESSION";
  session_id: string;
  nickname: string;
  term_rows: number;
  term_cols: number;
  created_at_ms: number;
  last_active_at_ms: number;
  ctx: string;
  mode: string;
  toast: string | null;
  root_conference_id: string | null;
  version: number;
  expiresAt: number;
};

function sessionPk(sessionId: string): string {
  return `SESSION#${sessionId}`;
}

function mapItemToSessionData(item: DdbSessionItem): SessionData {
  return {
    id: item.session_id,
    nickname: item.nickname,
    term: { rows: item.term_rows, cols: item.term_cols },
    state: {
      ctx: JSON.parse(item.ctx),
      mode: JSON.parse(item.mode),
      toast: item.toast ?? undefined,
      rootConferenceId: item.root_conference_id,
    },
    createdAtMs: item.created_at_ms,
    lastActiveAtMs: item.last_active_at_ms,
    version: item.version,
  };
}

export class DynamoSessionStore implements SessionStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async get(sessionId: string): Promise<SessionData | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: sessionPk(sessionId), SK: "SESSION" },
      }),
    );

    const item = result.Item as DdbSessionItem | undefined;
    if (!item) return null;

    return mapItemToSessionData(item);
  }

  async create(args: {
    sessionId: string;
    nickname: string;
    term: { rows: number; cols: number };
    state: SerializedSessionState;
    ttlMs: number;
  }): Promise<SessionData> {
    const now = Date.now();
    const expiresAt = Math.floor((now + args.ttlMs) / 1000);

    const item: DdbSessionItem = {
      PK: sessionPk(args.sessionId),
      SK: "SESSION",
      entityType: "SESSION",
      session_id: args.sessionId,
      nickname: args.nickname,
      term_rows: args.term.rows,
      term_cols: args.term.cols,
      created_at_ms: now,
      last_active_at_ms: now,
      ctx: JSON.stringify(args.state.ctx),
      mode: JSON.stringify(args.state.mode),
      toast: args.state.toast ?? null,
      root_conference_id: args.state.rootConferenceId,
      version: 1,
      expiresAt,
    };

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );

    return mapItemToSessionData(item);
  }

  async update(args: {
    sessionId: string;
    state: SerializedSessionState;
    expectedVersion: number;
    ttlMs: number;
  }): Promise<SessionData> {
    const now = Date.now();
    const expiresAt = Math.floor((now + args.ttlMs) / 1000);
    const newVersion = args.expectedVersion + 1;

    try {
      const result = await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: sessionPk(args.sessionId), SK: "SESSION" },
          UpdateExpression: `
            SET ctx = :ctx,
                #mode = :mode,
                toast = :toast,
                root_conference_id = :rootConfId,
                last_active_at_ms = :lastActive,
                #version = :newVersion,
                expiresAt = :expiresAt
          `,
          ConditionExpression: "#version = :expectedVersion",
          ExpressionAttributeNames: {
            "#mode": "mode",
            "#version": "version",
          },
          ExpressionAttributeValues: {
            ":ctx": JSON.stringify(args.state.ctx),
            ":mode": JSON.stringify(args.state.mode),
            ":toast": args.state.toast ?? null,
            ":rootConfId": args.state.rootConferenceId,
            ":lastActive": now,
            ":newVersion": newVersion,
            ":expectedVersion": args.expectedVersion,
            ":expiresAt": expiresAt,
          },
          ReturnValues: "ALL_NEW",
        }),
      );

      return mapItemToSessionData(result.Attributes as DdbSessionItem);
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "ConditionalCheckFailedException"
      ) {
        throw new ConflictError(
          `Session version conflict for ${args.sessionId}`,
        );
      }
      throw error;
    }
  }

  async delete(sessionId: string): Promise<boolean> {
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: sessionPk(sessionId), SK: "SESSION" },
          ConditionExpression: "attribute_exists(PK)",
        }),
      );
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "ConditionalCheckFailedException"
      ) {
        return false;
      }
      throw error;
    }
  }
}
