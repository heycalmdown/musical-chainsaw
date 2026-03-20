import { context, runIfLocal, wrapHandler } from "faas-util";

import { handleDeleteSessionRequest } from "../../src/api";
import { rethrowApiError } from "./lib/shared";

export const handler = wrapHandler(async (event) => {
  try {
    return {
      ...(await handleDeleteSessionRequest(event.pathParameters?.sessionId)),
      "@statusCode": 200,
    };
  } catch (error) {
    rethrowApiError(error);
  }
});

runIfLocal(
  module,
  handler,
  context({ pathParameters: { sessionId: "local" } }),
);
