# 세션 아키텍처

## 개요

BBS 서버는 DynamoDB 기반의 stateless 세션 관리를 사용합니다. 이를 통해 서버를 수평 확장할 수 있으며, 서버 재시작 시에도 세션이 유지됩니다.

## 세션 저장 구조

### DynamoDB 키 패턴

```
PK: SESSION#{sessionId}
SK: SESSION
```

기존 BBS 데이터(Conference, Board, Post 등)와 동일한 테이블을 공유하며, 단일 테이블 디자인을 따릅니다.

### DynamoDB 아이템 스키마

| 속성 | 타입 | 설명 |
|------|------|------|
| `PK` | String | `SESSION#{sessionId}` |
| `SK` | String | `SESSION` (고정값) |
| `entityType` | String | `SESSION` (고정값) |
| `session_id` | String | UUID 형식의 세션 ID |
| `nickname` | String | 사용자 닉네임 (최대 20자) |
| `term_rows` | Number | 터미널 행 수 (10-200) |
| `term_cols` | Number | 터미널 열 수 (20-240) |
| `created_at_ms` | Number | 세션 생성 시간 (Unix ms) |
| `last_active_at_ms` | Number | 마지막 활동 시간 (Unix ms) |
| `ctx` | String | JSON 직렬화된 TerminalContext |
| `mode` | String | JSON 직렬화된 UI Mode 상태 |
| `toast` | String | 알림 메시지 (nullable) |
| `root_conference_id` | String | 루트 컨퍼런스 ID (nullable) |
| `version` | Number | 낙관적 잠금용 버전 번호 |
| `expiresAt` | Number | TTL 만료 시간 (Unix 초) |

### 예시 아이템

```json
{
  "PK": "SESSION#550e8400-e29b-41d4-a716-446655440000",
  "SK": "SESSION",
  "entityType": "SESSION",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "nickname": "kei",
  "term_rows": 24,
  "term_cols": 80,
  "created_at_ms": 1706745600000,
  "last_active_at_ms": 1706745650000,
  "ctx": "{\"user\":\"kei\",\"rows\":24,\"cols\":80,\"postsPageSize\":10}",
  "mode": "{\"kind\":\"menu\",\"conference\":{\"id\":\"0\",\"name\":\"Lobby\",...},\"items\":[...]}",
  "toast": null,
  "root_conference_id": "0",
  "version": 3,
  "expiresAt": 1706747400
}
```

## 세션 상태 구조

### SerializedSessionState

세션의 UI 상태를 직렬화한 구조입니다.

```typescript
type SerializedSessionState = {
  ctx: {
    user: string;        // 사용자 닉네임
    rows: number;        // 터미널 행 수
    cols: number;        // 터미널 열 수
    postsPageSize: number; // 페이지당 게시글 수
  };
  mode: Mode;            // 현재 UI 모드 (31가지 상태)
  toast: string | undefined;  // 일회성 알림 메시지
  rootConferenceId: string | null;  // 루트 컨퍼런스 ID
};
```

### Mode (UI 상태)

BBS는 31가지 UI 모드를 가진 상태 머신입니다. 각 모드는 현재 화면과 필요한 데이터를 포함합니다.

#### 주요 모드 목록

| 모드 | 설명 |
|------|------|
| `conferenceManage` | 컨퍼런스 관리 화면 |
| `conferenceAdd` | 컨퍼런스 추가 |
| `conferenceRename` | 컨퍼런스 이름 변경 |
| `welcome` | 환영 화면 |
| `welcomeEditTitle` | 환영 제목 편집 |
| `welcomeEditBody` | 환영 본문 편집 |
| `menu` | 메뉴 화면 |
| `menuDesignTitle` | 메뉴 디자인 제목 |
| `menuDesignBody` | 메뉴 디자인 본문 |
| `menuEdit` | 메뉴 항목 편집 |
| `menuEditLabel` | 메뉴 라벨 편집 |
| `menuAddType` | 메뉴 항목 타입 선택 |
| `boardManage` | 게시판 관리 |
| `boardAdd` | 게시판 추가 |
| `boardRename` | 게시판 이름 변경 |
| `posts` | 게시글 목록 |
| `post` | 게시글 보기 |
| `writeTitle` | 게시글 제목 작성 |
| `writeBody` | 게시글 본문 작성 |
| `page` | 페이지 보기 |
| `link` | 링크 보기 |

#### 모드 예시

```typescript
// 메뉴 화면
{
  kind: "menu",
  conference: { id: "0", name: "Lobby", ... },
  items: [
    { id: "1", label: "General", actionType: "board", ... },
    { id: "2", label: "Main", actionType: "conference", ... }
  ]
}

// 게시글 목록
{
  kind: "posts",
  conference: { id: "1", name: "Main", ... },
  board: { id: "abc123", name: "General", ... },
  posts: [
    { id: "post1", title: "Hello", author: "kei", createdAt: "..." },
    ...
  ],
  pageState: {
    page: 0,
    pageCursors: [null],
    nextCursor: "eyJQSyI6Ii4uLiJ9"
  }
}
```

## 세션 수명 주기

### 1. 세션 생성

```
POST /api/sessions
{
  "nickname": "kei",
  "rows": 24,
  "cols": 80
}
```

1. 닉네임 검증 및 정규화
2. 터미널 크기 정규화 (기본값: 24x80)
3. UUID 생성
4. `BbsUiSession` 인스턴스 생성
5. `handleHello()` 호출하여 초기 화면 생성
6. DynamoDB에 세션 저장 (version=1)
7. 세션 ID와 초기 화면 반환

### 2. 이벤트 처리

```
POST /api/sessions/{sessionId}/events
{
  "input": "1"
}
```

1. DynamoDB에서 세션 조회
2. `BbsUiSession.deserialize()`로 세션 복원
3. `handleEvent(input)` 호출
4. 새 상태를 DynamoDB에 저장 (낙관적 잠금)
5. 충돌 시 최대 3회 재시도
6. 새 화면 반환

### 3. 세션 종료

두 가지 방식으로 종료:

**명시적 종료:**
```
DELETE /api/sessions/{sessionId}
```

**자동 종료:**
- 사용자가 "종료" 선택 시 `shouldExit(screen)` 조건 충족
- DynamoDB에서 세션 삭제

### 4. TTL 만료

- 기본 TTL: 30분 (환경변수 `BBS_SESSION_TTL_MS`로 설정)
- 매 이벤트 처리 시 TTL 갱신
- DynamoDB TTL 기능으로 자동 삭제 (최대 48시간 지연 가능)

## 동시성 처리

### 낙관적 잠금 (Optimistic Locking)

여러 서버 인스턴스가 동일한 세션을 동시에 처리할 때 발생할 수 있는 충돌을 방지합니다.

```typescript
// 업데이트 시 버전 체크
UpdateExpression: "SET ... #version = :newVersion",
ConditionExpression: "#version = :expectedVersion"
```

### 충돌 해결 흐름

```
1. 세션 조회 (version=3)
2. 이벤트 처리
3. 업데이트 시도 (expectedVersion=3)
4. 충돌 발생 (다른 요청이 먼저 version=4로 업데이트)
5. 재시도: 세션 다시 조회 (version=4)
6. 이벤트 재처리
7. 업데이트 성공 (version=5)
```

최대 3회 재시도 후에도 실패하면 409 Conflict 응답.

## 파일 구조

```
src/
├── session-store.ts    # 세션 저장소 인터페이스 및 DynamoDB 구현
├── server.ts           # HTTP 서버 및 세션 API 엔드포인트
├── ui/
│   └── session.ts      # BbsUiSession 클래스 (UI 상태 머신)
└── db.ts               # DynamoDB 클라이언트 및 BBS 데이터 접근
```

### 주요 클래스/인터페이스

#### SessionStore (session-store.ts)

```typescript
interface SessionStore {
  get(sessionId: string): Promise<SessionData | null>;
  create(args: CreateSessionArgs): Promise<SessionData>;
  update(args: UpdateSessionArgs): Promise<SessionData>;
  delete(sessionId: string): Promise<boolean>;
}
```

#### BbsUiSession (ui/session.ts)

```typescript
class BbsUiSession {
  // 상태 직렬화
  serialize(): SerializedSessionState;
  
  // 상태 복원
  static deserialize(db: BbsDb, state: SerializedSessionState): BbsUiSession;
  
  // 초기 화면 생성
  handleHello(payload: HelloPayload): Promise<ScreenModel>;
  
  // 이벤트 처리
  handleEvent(input: string): Promise<ScreenModel>;
}
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `BBS_PORT` | 8787 | 서버 포트 |
| `BBS_DDB_TABLE` | Bbs | DynamoDB 테이블 이름 |
| `BBS_DDB_REGION` | ap-northeast-2 | AWS 리전 |
| `BBS_DDB_ENDPOINT` | - | DynamoDB 엔드포인트 (로컬 테스트용) |
| `BBS_SESSION_TTL_MS` | 1800000 | 세션 TTL (30분) |

## 장점

1. **Stateless 서버**: 서버 인스턴스 간 세션 공유 불필요
2. **수평 확장**: 로드 밸런서 뒤에 여러 서버 배치 가능
3. **내구성**: 서버 재시작/장애 시에도 세션 유지
4. **자동 정리**: DynamoDB TTL로 만료 세션 자동 삭제
5. **단일 테이블**: 기존 BBS 데이터와 동일한 테이블 사용으로 관리 단순화
