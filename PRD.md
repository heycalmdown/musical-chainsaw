PRD — Web Terminal BBS-Style (MVP)

Goal
	•	브라우저에서 접속 가능한 텍스트 기반 BBS
	•	클라이언트는 xterm.js로 터미널 느낌의 UI 제공
	•	서버는 세션 상태 머신(Server‑Driven UI)으로 화면을 생성
	•	통신은 REST 기반(추후 서버→클라이언트 푸시를 위해 WS 도입 가능)

Scope

In
	•	오픈 접속(닉네임 기반)
	•	터미널 스타일 화면(클리어+리드로우)
	•	Boards: list / post list / read / write
	•	저장소: sqlite
	•	REST API: 세션 생성 + 입력 이벤트 전송

Out (MVP)
	•	로그인/계정(추후)
	•	댓글, 수정/삭제, 검색
	•	권한/역할, 첨부
	•	실시간 채팅/귓속말(WS 도입 후)

Architecture

Browser (xterm.js)
  → REST API (/api/sessions, /api/sessions/:id/events)
    → App Server (Session state machine + rendering)
      → sqlite

Components

Web Client
	•	터미널 렌더링(xterm.js)
	•	입력(라인 단위) 수집 후 서버에 전송
	•	요청 직렬화(세션당 in-flight=1, 입력 큐잉)

App Server
	•	세션 상태 머신(연결이 아니라 sessionId로 유지)
	•	커맨드 파싱/페이징/검증/DB 접근
	•	매 이벤트마다 ScreenModel 반환

Terminal Size Policy (MVP)
	•	세션 생성 시 rows/cols를 고정하고 이후 resize는 무시

UX
	•	번호 기반 메인 메뉴
	•	Post list: N / P / R <id> / W / 0
	•	Post view: N / P / 0
	•	Write flow: title + body, . to finish

API (MVP)
	•	POST /api/sessions { nickname, rows, cols } → { sessionId, screen }
	•	POST /api/sessions/:id/events { input } → { screen }
	•	DELETE /api/sessions/:id → { ok }

Data Model (sqlite)

boards
	•	id
	•	name
	•	sort_order

posts
	•	id
	•	board_id
	•	title
	•	body
	•	author
	•	created_at

Index:
	•	(board_id, id DESC)

Non-Functional
	•	Target concurrency: 10–50 users
	•	Exit sessions on daemon failure
	•	Managed via systemd

Ops / Security
	•	닉네임 검증/제어문자 제거
	•	레이트리밋/스팸 방지(추후)
	•	배포 시 TLS는 CloudFront/ACM 등 외부에서 처리

Milestones
	1.	REST API server + schema
	2.	Web client (xterm.js) + read flow
	3.	Write flow
	4.	(선택) WS push + whisper/notice
