import { CustomError } from "faas-util";

import { ApiRequestError, parseJsonText } from "../../../src/api";

export function parseEventBody(
  body: string | null | undefined,
  maxBytes: number,
): unknown {
  return parseJsonText(body, maxBytes);
}

export function rethrowApiError(error: unknown): never {
  if (error instanceof ApiRequestError) {
    throw new CustomError(error.statusCode, {
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  throw error;
}
