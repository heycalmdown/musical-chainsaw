# 제안: bbs Thin Client + bbsd Server‑Driven UI (IPC v2)

목표는 `PRD.md`의 목적/기능을 유지하면서, **`bbs`(클라이언트)를 최대한 얇게** 만들고 **기능/로직 확장을 `bbsd`에서만** 하기 쉽게 구조를 재설계하는 것이다. (기술 관점 제안 문서)

## 현재 구조에서의 문제(기술적)

- `bbs`가 **상태(라우팅), 커맨드 파싱, 페이징/줄바꿈, 작성 플로우** 등 “앱 로직”을 많이 소유
- 기능 추가 시 `bbs`와 `bbsd`를 동시에 수정해야 하는 경우가 많아짐
  - 예: 검색/정렬/필터, 작성 UX 확장, 권한/차단, 읽음 처리 등
- 테스트/검증이 어려움
  - UI 로직이 `bbs`에 흩어져 있으면 세션 흐름(상태 전이)을 단위 테스트하기 힘듦

## 재설계 핵심 아이디어

`bbsd`가 **세션 상태 머신 + 화면(ViewModel) 생성**까지 담당하고, `bbs`는 **터미널 어댑터**(렌더링/입력 전송)만 담당한다.

즉, `bbsd`가 “무엇을 보여주고 어떤 입력을 받을지”를 결정하는 **Server‑Driven UI** 형태로 만든다.

### 책임 분리(권장)

**`bbs` (Thin Client)**
- 터미널 렌더링: clear/redraw, 단순 출력(서버가 준 라인 그대로)
- 입력 수집: 라인 입력(현재 방식 유지), 필요 시 터미널 크기(rows/cols) 포함 전송
- 연결/재연결/종료 처리(daemon 장애 시 종료 포함)
- “앱 로직” 없음(페이징, 커맨드 파싱, 유효성 검증 등은 하지 않음)

**`bbsd` (App Server)**
- 세션 상태 머신(연결 단위 세션): 메뉴/목록/읽기/쓰기 상태 및 전이
- 커맨드 파싱(예: `N`, `P`, `R <id>`, `W`, `0`)
- 페이징/줄바꿈(terminal size 기반), 도움말/힌트 텍스트 생성
- 모든 유효성 검증(존재하는 board/post, page 범위 등)
- DB 접근 + 기능 확장 지점(검색/권한/감사로그 등)

## IPC v2: “UI 이벤트 → 화면” 프로토콜

기존 CRUD성 RPC(`listBoards`, `listPosts`, …)는 내부 구현으로 남겨두거나, 점진적 이행을 위해 병행할 수 있다. Thin client 목표를 위해서는 `bbs`가 호출하는 IPC를 **UI 중심**으로 바꾸는 편이 좋다.

### 메시지 개요(JSONL)

요청(클라이언트→서버):
- `ui.hello`: 세션 시작(사용자/터미널 크기 전달)
- `ui.event`: 사용자 입력 이벤트(한 줄 입력)
- `ui.resize`(선택): 크기 변경(혹은 매 요청에 rows/cols 포함으로 대체)

응답(서버→클라이언트, 요청 id로 매칭):
- 성공 시 `payload.screen` 반환(렌더링할 화면 모델)
- 실패 시 에러(`BAD_REQUEST`, `INTERNAL`, …)

### ScreenModel(예시 스키마)

서버가 만든 화면을 “그대로” 그리기 위한 최소 모델:
```ts
type ScreenModel = {
  title: string;
  lines: string[];        // 이미 줄바꿈/페이징 반영된 출력 라인들
  prompt: string;         // 예: "> ", "body> "
  inputMode: "line" | "multiline";
  hints?: string[];       // 하단 도움말(선택)
  toast?: string;         // 1회성 메시지(선택)
  actions?: { type: "exit" }[]; // 서버가 세션 종료를 지시할 때(선택)
};
```

클라이언트는 `title/lines/hints/toast`를 출력하고 `prompt`로 입력만 받는다.

### 요청 페이로드(예시)

```json
{ "id": 1, "type": "ui.hello", "payload": { "user": "kson", "rows": 24, "cols": 80 } }
{ "id": 2, "type": "ui.event", "payload": { "input": "1", "rows": 24, "cols": 80 } }
{ "id": 3, "type": "ui.event", "payload": { "input": "R 12", "rows": 24, "cols": 80 } }
```

세션 식별은 **연결 단위**로도 충분하지만(Unix socket에서 일반적으로), 운영/디버깅을 위해 `sessionId`를 응답에 포함시키고 요청에 되돌려 받는 형태도 가능하다.

## bbsd 내부 구조 제안(확장 용이성)

`bbsd`를 다음 3계층으로 나누면 기능 추가가 “상태+렌더러 추가”로 정리된다.

1) **Domain/Storage**
- `Board`, `Post` 모델
- sqlite access (`BbsDb`)

2) **Application Service**
- `BbsService`: `listBoards`, `listPosts`, `getPost`, `createPost` 등 도메인 기능(정책/검증 포함)

3) **Session/UI**
- `SessionState`(상태): `boards` | `posts(boardId,page)` | `post(postId,page)` | `writeTitle(boardId)` | `writeBody(boardId,title,lines[])`
- `reduce(state, event) -> newState + effects`
  - effects: DB 조회/생성, toast 생성, exit 등
- `render(state, context) -> ScreenModel`
  - context: `rows/cols/user`

이 구조면 검색/권한/댓글(미범위지만) 같은 기능이 들어와도:
- `BbsService`에 기능 추가
- `SessionState`/`reduce`에 전이 추가
- `render`에 화면 추가
로 끝나고, `bbs`는 거의 수정하지 않게 된다.

## 상태 전이(예시)

- `boards`:
  - 입력 `1..n` → `posts(boardId, page=1)`
  - 입력 `0` → `exit`
- `posts(boardId,page)`:
  - `N` → `page+1`
  - `P` → `max(1,page-1)`
  - `R <id>` → `post(postId, page=1)`
  - `W` → `writeTitle(boardId)`
  - `0` → `boards`
- `post(postId,page)`:
  - `N/P` → 본문 페이지 이동(서버가 rows/cols 기반으로 페이지 계산)
  - `0` → 직전 `posts(...)`로 복귀(서버가 이전 상태를 스택으로 기억 가능)
- `writeTitle(boardId)`:
  - `0` → `posts(...)`
  - 기타 → `writeBody(boardId,title,lines=[])`
- `writeBody(...)` (multiline):
  - `.` 단독 라인 → `createPost` effect → `posts(boardId,page=1)` + toast
  - `0` → `posts(...)`
  - 그 외 → lines append

## 페이징/줄바꿈을 서버로 올리는 이유

- `rows/cols`를 서버가 알고 있으면, **본문/목록 페이징 규칙을 서버에서 일관되게** 유지할 수 있음
- 클라이언트가 단순해지고, “화면 로직”이 서버에서 테스트 가능해짐
- 향후 다른 클라이언트(예: 웹, telnet 등)가 생겨도, 동일 상태 머신을 재사용 가능

## 에러/장애 처리(Thin client 관점)

- `bbsd` 연결 종료 시: 클라이언트는 즉시 종료(요구사항)
- 서버가 `actions: [{type:"exit"}]`를 줄 수도 있고, 단순히 소켓 close로도 충분
- 요청 타임아웃/프로토콜 오류: 클라이언트는 “연결 문제”로 처리하고 종료 또는 재시도(정책 선택)

## 점진적 마이그레이션(권장)

코드 대규모 교체 없이 아래 순서로 진행 가능:

1) `bbsd`에 `ui.*` 엔드포인트 추가(세션 상태 머신 + render)
   - 기존 `listBoards/...`는 내부 서비스로 재사용
2) `bbs`를 `ui.*` 기반으로 전환
   - 커맨드 파싱/페이징/작성 플로우 제거(Thin client 완성)
3) 안정화 후 기존 CRUD RPC는 유지/제거 선택

## 트레이드오프

- 서버가 UI 표현을 일부 소유하므로, “완전한 UI 독립성”은 줄어듦
  - 대신 **기능 추가/정책 변경이 서버 중심**으로 쉬워짐(요구사항에 더 적합)
- 멀티라인 입력에서 요청/응답이 더 잦아질 수 있음
  - 유닉스 소켓/로컬 환경에서는 비용이 낮고, 필요하면 `ui.event`에 `batchLines` 같은 최적화를 추가 가능

