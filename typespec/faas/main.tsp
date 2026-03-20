import "@typespec/http";
import "@typespec/openapi3";
import "@typespec/openapi";

import "./model.tsp";

using TypeSpec.Http;

@service(#{ title: "faas-chol" })
@server("https://api.kson.live", "Public Gateway")
@route("/chol")
namespace Chol;

model HealthResponse {
  ok: true;
}

model ScreenAction {
  type: "exit";
}

model ScreenModel {
  title: string;
  lines: string[];
  prompt: string;
  inputMode: "line" | "multiline";
  hints?: string[];
  toast?: string;
  actions?: ScreenAction[];
}

model CreateSessionRequest {
  nickname: string;
  rows?: int32;
  cols?: int32;
}

model CreateSessionResponse {
  sessionId: string;
  screen: ScreenModel;
}

model SessionEventRequest {
  input: string;
}

model SessionEventResponse {
  screen: ScreenModel;
}

model DeleteSessionResponse {
  ok: boolean;
  deleted: boolean;
}

@get
@route("/health")
op Health(): HealthResponse;

@post
@route("/sessions")
op CreateSession(@body body: CreateSessionRequest): CreateSessionResponse;

@post
@route("/sessions/{sessionId}/events")
op SessionEvent(
  @path sessionId: string,
  @body body: SessionEventRequest,
): SessionEventResponse;

@delete
@route("/sessions/{sessionId}")
op DeleteSession(@path sessionId: string): DeleteSessionResponse;
