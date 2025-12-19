# test-bbs (Web MVP)

브라우저에서 자유롭게 접속하는 클래식 BBS 스타일 “터미널 화면” MVP.

- 클라이언트: **xterm.js** (터미널 렌더링)
- 서버: Node.js + sqlite + **세션 상태 머신(Server‑Driven UI)**
- 통신: **REST** (`/api/sessions`, `/api/sessions/:id/events`)

## 요구사항

- Node.js **v22+** (현재 Node 23에서도 동작)

## 실행(로컬 개발)

```sh
npm install
```

터미널 1 (API 서버):
```sh
npm run dev:server
```

터미널 2 (웹):
```sh
npm run dev:web
```

브라우저: `http://localhost:5173`

## 동작/제약(MVP)

- 닉네임 기반(완전 오픈), 로그인/계정은 추후
- 터미널 크기(rows/cols)는 **세션 시작 시 고정**, 이후 resize는 무시
  - 기본값: 80x24

## 커맨드

- 메인 메뉴: 보드 번호 선택, `0` 종료
- 글 목록: `N` 다음, `P` 이전, `R <id>` 읽기, `W` 쓰기, `0` 뒤로
- 글 보기: `N` 다음 페이지, `P` 이전 페이지, `0` 뒤로
- 글 쓰기: 제목 → 본문 입력, `.` 단독 입력 시 완료

## 설정(환경변수)

- `BBS_PORT` (기본 `8787`)
- `BBS_DB_PATH` (기본 `./var/bbs.sqlite3`)
- `BBS_SESSION_TTL_MS` (기본 30분)
