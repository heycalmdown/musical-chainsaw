# 실행 계획 (MVP) — SSH Classic BBS-Style

본 문서는 `PRD.md`를 기준으로, **TypeScript / Node.js**로 **`tsx` 실행**을 전제로 한 구현 실행 계획이다.

## 목표/범위

- 목표: SSH 로그인 시 bash 대신 **텍스트 기반 BBS(TUI)** 실행
- UI: 클래식 BBS 스타일(번호 기반 메뉴), ANSI fullscreen(클리어+리드로우)
- 기능(MVP): 보드 목록 / 글 목록 / 글 읽기 / 글 쓰기
- 사용자 식별: SSH username
- IPC: **Unix domain socket** + **JSON Lines(JSONL)**
- 저장소: sqlite

비범위: 채팅/댓글, 수정/삭제, 검색, 권한/역할, 첨부, 웹 UI

## 아키텍처 요약

`SSH Client → sshd → bbs(TUI, per-session) → Unix socket → bbsd(daemon) → sqlite`

- `bbs`: 렌더링/입력/네비게이션, daemon에 요청/응답 처리
- `bbsd`: 유닉스 소켓 서버, board/post 읽기/생성, sqlite 접근

## IPC 프로토콜 (JSONL)

- 1줄에 1 JSON 메시지(요청/응답)
- 요청/응답은 `id`로 매칭

요청 예:
```json
{ "id": 1, "type": "listBoards", "payload": {} }
```

권장 응답 형태:
```json
{ "id": 1, "ok": true, "payload": { "boards": [] } }
```
에러 응답:
```json
{ "id": 1, "ok": false, "error": { "code": "INTERNAL", "message": "..." } }
```

MVP 메시지:
- `listBoards`
- `listPosts` `{ boardId, page, pageSize }`
- `getPost` `{ postId }`
- `createPost` `{ boardId, title, body, author }`

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

## 디렉터리/엔트리포인트 제안

- `src/bbsd.ts` : daemon 엔트리
- `src/bbs.ts` : TUI 엔트리
- `src/ipc/` : 타입/클라이언트/서버 프레이밍(JSONL)
- `src/db/` : 스키마/쿼리
- `src/tui/` : 화면 렌더/입력/라우팅(메뉴)

## 개발 단계 (Milestones)

### 1) Daemon + schema

- 프로젝트 초기화
  - `tsx` 실행 스크립트 구성
  - 환경값(소켓 경로/DB 경로) 설계
- sqlite 스키마 생성 및 기본 보드 시드(예: `General`)
- `bbsd` 구현
  - Unix socket 서버 바인딩/권한(umask 또는 chmod)
  - JSONL 파서/프레이머(라인 단위)
  - 라우팅: `type` → 핸들러
  - 기본 동시성(10–50): 커넥션별 처리 + DB 접근 직렬화/풀 전략 확정
- 실패 처리
  - daemon 장애 시 `bbs`는 종료(요구사항)
  - 타임아웃/잘못된 메시지 방어

**완료 기준**
- `bbsd` 단독 실행 시 소켓 생성, 샘플 요청에 정상 응답

### 2) TUI read flow

- ANSI fullscreen(클리어+리드로우) 기반 화면 프레임 구축
- 입력 처리(라인 버퍼) + 키 커맨드(숫자/명령) 처리
- 화면/라우팅
  - 메인 메뉴(보드 선택)
  - 글 목록: `N`/`P` 페이지 이동, `R` 읽기(글 id 입력), `0` 뒤로
  - 글 보기: 간단 페이징(스크롤/페이지 단위)
- IPC 클라이언트
  - 요청 `id` 증가, 응답 매칭, 예외/timeout 처리

**완료 기준**
- `bbs`에서 보드 → 글 목록 → 글 보기까지 정상 동작

### 3) Write flow

- 글 작성 플로우
  - 제목 입력
  - 본문 입력(여러 줄), `.` 단독 입력 시 종료
  - `author`는 SSH username 사용
- 작성 후 목록 갱신 및 성공/실패 피드백

**완료 기준**
- 글 작성 후 목록/조회에서 생성 글 확인 가능

### 4) Ops setup

- systemd
  - `bbsd.service`(또는 `bbsd.socket` + `bbsd.service`) 설계
  - 소켓 파일 권한/소유자/그룹 제한
- sshd
  - `ForceCommand`로 `bbs` 실행
  - 필요한 경우 제한된 shell/환경 설정

**완료 기준**
- 운영 환경에서 재부팅 후 자동 기동 + SSH 접속 시 BBS 진입

## 로컬 실행 예시 (개발용)

- daemon: `tsx src/bbsd.ts`
- tui: `tsx src/bbs.ts`

## 결정/확정 필요 사항

- 소켓 경로/권한 정책(예: `/tmp` vs `/run`, 소유자/그룹)
- DB 파일 위치 및 백업/권한
- 기본 `pageSize` 및 글 보기 페이징 UX

