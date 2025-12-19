# 실행 계획 (MVP) — Web Terminal BBS-Style

본 문서는 `PRD.md`를 기준으로, **TypeScript / Node.js** + **Vite(xterm.js)** 기준의 구현 실행 계획이다.

## 목표/범위

- 목표: 브라우저에서 접속 가능한 **텍스트 기반 BBS**
- UI: 터미널 스타일(클리어+리드로우), 번호 기반 메뉴
- 기능(MVP): 보드 목록 / 글 목록 / 글 읽기 / 글 쓰기
- 사용자 식별: 닉네임(오픈)
- 통신: **REST 세션 API**
- 저장소: sqlite

비범위(MVP): 로그인/계정, 채팅/귓속말(WS 도입 후), 댓글, 수정/삭제, 검색, 권한/역할, 첨부

## 아키텍처 요약

`Browser(xterm.js) → REST API → Session state machine(render ScreenModel) → sqlite`

- Web client: 화면 렌더링 + 입력 수집(라인 단위) + 요청 직렬화(in-flight=1)
- Server: 세션 상태 머신 + 커맨드 파싱 + 페이징/줄바꿈 + DB 접근

## API (REST)

세션 생성:
```http
POST /api/sessions
Content-Type: application/json

{ "nickname": "kson", "rows": 24, "cols": 80 }
```

응답:
```json
{ "sessionId": "...", "screen": { "title": "...", "lines": [], "prompt": "> ", "inputMode": "line" } }
```

입력 이벤트:
```http
POST /api/sessions/:id/events
Content-Type: application/json

{ "input": "N" }
```

## 터미널 크기 정책(MVP)

- `rows/cols`는 세션 생성 시 고정
- 이후 브라우저 resize는 무시(요청에도 반영하지 않음)

## 데이터 모델 (sqlite)

`boards`
- `id` (PK)
- `name`
- `sort_order`

`posts`
- `id` (PK)
- `board_id` (FK)
- `title`
- `body`
- `author`
- `created_at`

인덱스:
- `posts(board_id, id DESC)`

## 디렉터리/엔트리포인트

- `src/server.ts`: REST API 서버
- `src/ui/session.ts`: 세션 상태 머신 + ScreenModel 렌더링
- `web/`: Vite + xterm.js 웹 클라이언트

## 개발 단계 (Milestones)

### 1) REST API server + schema

- sqlite 스키마 생성 및 기본 보드 시드
- 세션 관리
  - `sessionId` 발급
  - 세션 TTL 정리
  - 세션 단위 요청 직렬화(서버 방어)

**완료 기준**
- `POST /api/sessions`로 화면을 받고, `POST /events`로 상태 전이가 됨

### 2) Web client (xterm.js) read flow

- xterm.js로 화면 출력(clear+redraw)
- 입력은 라인 단위로 서버에 전송
- 요청 직렬화(in-flight=1) + 입력 큐잉

**완료 기준**
- 보드 → 글 목록 → 글 보기까지 정상 동작

### 3) Write flow

- 제목 입력 → 본문 입력(여러 줄) → `.` 단독 입력 시 완료

**완료 기준**
- 작성 후 목록/조회에서 생성 글 확인 가능

### 4) (선택) WS push

- 귓속말/공지 등 서버→클라이언트 이벤트가 필요해지면 WS 도입
