import { context, runIfLocal, wrapHandler } from "faas-util";

import { handleHealthRequest } from "../../src/api";
import { rethrowApiError } from "./lib/shared";

export const handler = wrapHandler(async () => {
  try {
    return {
      ...(await handleHealthRequest()),
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
    httpMethod: "GET",
    path: "/health",
    resource: "/health",
  }),
);
