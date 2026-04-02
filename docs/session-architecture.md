# 세션 아키텍처

## 개요

BBS 서버는 Aurora DSQL 기반의 stateless 세션 관리를 사용합니다. UI 상태는 서버 메모리에 고정하지 않고 데이터베이스의 `sessions` 테이블에 저장하므로, 서버 재시작 이후에도 세션을 복원할 수 있고 여러 인스턴스가 동일한 세션을 처리할 수 있습니다.

세션은 다음 요소로 구성됩니다.

- 세션 식별자와 메타데이터
- 터미널 크기 정보
- 직렬화된 UI 상태(`ctx`, `mode`, `toast`, `rootConferenceId`)
- 낙관적 잠금을 위한 `version`
- 만료 시각(`expires_at_ms`)

## 세션 저장 구조

### 저장소

세션은 Aurora DSQL 스키마의 `sessions` 테이블에 저장됩니다.

### 테이블 스키마

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `session_id` | `TEXT` | 세션 ID, 기본 키 |
| `nickname` | `TEXT` | 사용자 닉네임 |
| `term_rows` | `INTEGER` | 터미널 행 수 |
| `term_cols` | `INTEGER` | 터미널 열 수 |
| `created_at_ms` | `BIGINT` | 세션 생성 시각 (Unix ms) |
| `last_active_at_ms` | `BIGINT` | 마지막 활동 시각 (Unix ms) |
| `ctx_json` | `TEXT` | `TerminalContext` JSON |
| `mode_json` | `TEXT` | 현재 UI mode JSON |
| `toast` | `TEXT` | 일회성 알림 메시지, nullable |
| `root_conference_id` | `TEXT` | 루트 컨퍼런스 ID, nullable |
| `version` | `INTEGER` | 낙관적 잠금용 버전 |
| `expires_at_ms` | `BIGINT` | 세션 만료 시각 (Unix ms) |

### 예시 레코드

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "nickname": "kei",
  "term_rows": 24,
  "term_cols": 80,
  "created_at_ms": 1706745600000,
  "last_active_at_ms": 1706745650000,
  "ctx_json": "{\"user\":\"kei\",\"rows\":24,\"cols\":80,\"postsPageSize\":10}",
  "mode_json": "{\"kind\":\"menu\",\"conference\":{\"id\":\"0\",\"name\":\"Lobby\"},\"items\":[...]}",
  "toast": null,
  "root_conference_id": "0",
  "version": 3,
  "expires_at_ms": 1706747400000
}
```

## 세션 상태 구조

### SerializedSessionState

세션의 UI 상태는 아래 구조로 직렬화되어 저장됩니다.

```typescript
type SerializedSessionState = {
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
```

`ctx`와 `mode`는 각각 `ctx_json`, `mode_json` 컬럼에 JSON 문자열로 저장되고, 조회 시 다시 역직렬화됩니다.

### Mode

`mode`는 현재 BBS UI 상태 머신의 화면 상태를 표현합니다. 예를 들어 메뉴 화면, 게시글 목록, 게시글 보기, 글쓰기 단계 같은 상태가 여기에 포함됩니다. 세션 복원 시 `BbsUiSession.deserialize()`가 이 값을 다시 로드해 같은 흐름을 이어갑니다.

예시:

```typescript
{
  kind: "posts",
  conference: { id: "1", name: "Main" },
  board: { id: "abc123", name: "General" },
  posts: [
    { id: "post1", title: "Hello", author: "kei", createdAt: "..." }
  ],
  pageState: {
    page: 0,
    pageCursors: [null],
    nextCursor: "..."
  }
}
```

## 세션 수명 주기

### 1. 세션 생성

`POST /chol/sessions`

1. 요청 본문에서 닉네임과 터미널 크기를 읽습니다.
2. 닉네임과 터미널 크기를 정규화합니다.
3. UUID 기반 `sessionId`를 생성합니다.
4. `BbsUiSession`을 만들고 `handleHello()`로 초기 화면을 생성합니다.
5. 직렬화된 상태를 `sessions` 테이블에 `version = 1`로 저장합니다.
6. `sessionId`와 초기 화면을 응답합니다.

### 2. 이벤트 처리

`POST /chol/sessions/{sessionId}/events`

1. `sessions` 테이블에서 세션을 조회합니다.
2. 만료된 세션이면 삭제 후 `404 Session not found`로 처리합니다.
3. `BbsUiSession.deserialize()`로 UI 상태를 복원합니다.
4. `handleEvent(input)`를 실행해 `screen | accepted` 이벤트 결과를 계산합니다.
5. `kind === "screen"` 이고 종료 화면이면 세션을 삭제합니다.
6. 종료가 아니면 `expectedVersion` 조건으로 세션을 갱신합니다.
7. 충돌이 나면 최대 3회까지 다시 읽고 재처리합니다.

### 3. 세션 종료

두 경로가 있습니다.

- 명시적 종료: `DELETE /chol/sessions/{sessionId}`
- UI 종료: 사용자가 종료 흐름에 진입해 `shouldExit(screen)`가 참이 되는 경우

둘 다 최종적으로 `sessions` 테이블에서 레코드를 삭제합니다.

## 만료 처리

- 기본 TTL은 30분이며 `BBS_SESSION_TTL_MS`로 조정할 수 있습니다.
- 세션 생성과 이벤트 처리 시마다 `expires_at_ms`를 현재 시각 기준으로 다시 갱신합니다.
- Aurora DSQL에 DynamoDB TTL 같은 자동 만료 기능을 쓰는 것은 아니며, 조회 시점에 `expires_at_ms <= Date.now()`이면 애플리케이션이 해당 세션을 삭제합니다.

즉, 만료 정리는 lazy cleanup 방식입니다. 오랫동안 다시 조회되지 않은 만료 세션은 DB에 잠시 남아 있을 수 있습니다.

## 동시성 처리

### 낙관적 잠금

동일 세션에 대해 여러 요청이 동시에 들어올 수 있으므로, 업데이트는 `version` 컬럼을 조건으로 수행합니다.

```sql
UPDATE sessions
SET
  ctx_json = $3,
  mode_json = $4,
  toast = $5,
  root_conference_id = $6,
  last_active_at_ms = $7,
  version = $8,
  expires_at_ms = $9
WHERE session_id = $1
  AND version = $2
RETURNING ...
```

영향받은 행이 없으면 다른 요청이 먼저 같은 세션을 갱신한 것으로 판단하고 `ConflictError`를 발생시킵니다.

### 충돌 처리 흐름

1. 요청 A와 요청 B가 둘 다 `version = 3` 상태를 읽습니다.
2. 요청 A가 먼저 갱신하여 `version = 4`가 됩니다.
3. 요청 B의 `WHERE version = 3` 업데이트는 실패합니다.
4. 요청 B는 세션을 다시 읽고, UI 이벤트를 다시 적용합니다.
5. 최대 3회 내에 성공하지 못하면 `409 CONFLICT`를 반환합니다.

Aurora DSQL의 재시도 가능한 오류도 세션 충돌과 동일하게 취급해 상위 레벨에서 재시도하도록 맞춰져 있습니다.

## 파일 구조

```text
src/
├── session-store.ts    # SessionStore 인터페이스 및 Aurora DSQL 구현
├── api.ts              # 세션 생성/이벤트/삭제 핸들러
├── ui/
│   └── session.ts      # BbsUiSession 상태 머신
├── db.ts               # BBS 도메인 데이터 접근
└── dsql.ts             # Aurora DSQL 연결 및 스키마 초기화
```

### 주요 구성 요소

#### SessionStore

```typescript
interface SessionStore {
  get(sessionId: string): Promise<SessionData | null>;
  create(args: CreateSessionArgs): Promise<SessionData>;
  update(args: UpdateSessionArgs): Promise<SessionData>;
  delete(sessionId: string): Promise<boolean>;
}
```

현재 구현체는 `DsqlSessionStore`이며, SQL 기반 CRUD와 버전 충돌 제어를 담당합니다.

#### BbsUiSession

```typescript
class BbsUiSession {
  serialize(): SerializedSessionState;
  static deserialize(db: BbsDb, state: SerializedSessionState): BbsUiSession;
  handleHello(payload: HelloPayload): Promise<ScreenModel>;
  handleEvent(input: string): Promise<SessionEventResponse>;
}
```

세션 저장소는 UI를 이해하지 않고 직렬화된 상태만 보관합니다. 실제 화면 전이 규칙은 `BbsUiSession`에 집중됩니다.
클라이언트는 서버가 반환한 `kind: "screen"` 응답만 렌더하고, `kind: "accepted"` 는 세션 상태 갱신만 반영합니다.

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `BBS_CONFIG_PREFIX` | `/chol/prod/bbs` | SSM 설정 prefix |
| `BBS_CONFIG_REGION` | `BBS_DSQL_REGION` 또는 `AWS_REGION` | 설정 조회 리전 |
| `BBS_DSQL_HOST` | - | Aurora DSQL 호스트 |
| `BBS_DSQL_REGION` | `ap-northeast-2` | Aurora DSQL 리전 |
| `BBS_DSQL_USER` | `admin` | DB 사용자 |
| `BBS_DSQL_DATABASE` | `postgres` | 데이터베이스 이름 |
| `BBS_DSQL_SCHEMA` | `public` | 스키마 이름 |
| `BBS_DSQL_MAX_CONNECTIONS` | `10` | 최대 연결 수 |
| `BBS_SESSION_TTL_MS` | `1800000` | 세션 TTL (30분) |

## 특성

1. Stateless 서버 구조라 인스턴스 로컬 메모리에 세션을 붙잡지 않습니다.
2. Aurora DSQL에 세션이 저장되므로 재시작 후에도 세션 복원이 가능합니다.
3. `version` 기반 낙관적 잠금으로 동시 요청 충돌을 제어합니다.
4. 세션 데이터와 BBS 도메인 데이터를 같은 Aurora DSQL 클러스터에서 함께 운영할 수 있습니다.
5. 만료 삭제는 DB 내장 TTL이 아니라 애플리케이션 레벨 검증과 삭제로 처리합니다.
