import { context, runIfLocal, wrapHandler } from "faas-util";

import { handleCreateSessionRequest } from "../../src/api";
import { parseEventBody, rethrowApiError } from "./lib/shared";

export const handler = wrapHandler(async (event) => {
  try {
    const body = parseEventBody(event.body, 64 * 1024);
    return {
      ...(await handleCreateSessionRequest(body)),
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
    path: "/sessions",
    resource: "/sessions",
    body: JSON.stringify({ nickname: "local" }),
  }),
);
