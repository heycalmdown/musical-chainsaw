import { context, runIfLocal, wrapHandler } from "faas-util";

import { handleSessionEventRequest } from "../../src/api";
import { parseEventBody, rethrowApiError } from "./lib/shared";

export const handler = wrapHandler(async (event) => {
  try {
    const body = parseEventBody(event.body, 128 * 1024);
    return {
      ...(await handleSessionEventRequest(
        event.pathParameters?.sessionId,
        body,
      )),
      "@statusCode": 200,
    };
  } catch (error) {
    rethrowApiError(error);
  }
});

runIfLocal(
  module,
  handler,
  context({
    httpMethod: "POST",
    path: "/sessions/local/events",
    resource: "/sessions/{sessionId}/events",
    pathParameters: { sessionId: "local" },
    body: JSON.stringify({ input: "1" }),
  }),
);
