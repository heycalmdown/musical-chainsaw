# test-bbs (Web MVP)

브라우저에서 자유롭게 접속하는 클래식 BBS 스타일 “터미널 화면” MVP.

- 클라이언트: **xterm.js** (터미널 렌더링)
- API 런타임: **AWS Lambda + Aurora DSQL** + **세션 상태 머신(Server‑Driven UI)**
- 통신: **REST** (`/chol/sessions`, `/chol/sessions/:id/events`)

## 요구사항

- Node.js **v22+** (현재 Node 23에서도 동작)

## 실행(로컬 개발)

```sh
npm install
```

CDK 앱은 루트와 별도 패키지입니다. 배포 관련 작업은 `manifest/`에서 `pnpm install` 후 실행합니다.

```sh
cd manifest
pnpm install
pnpm run cdk:synth
```

Aurora DSQL 접속 정보가 필요합니다. 기본적으로 SSM의 `/chol/prod/bbs` prefix에서 자동 조회하고, 직접 env를 주면 그 값이 우선합니다.

```sh
export BBS_CONFIG_REGION="ap-northeast-2"
export BBS_DSQL_REGION="ap-northeast-2"
```

직접 지정이 필요하면 아래 env가 우선합니다.

```sh
export BBS_DSQL_HOST="<cluster-endpoint>"
export BBS_DSQL_USER="admin"
export BBS_DSQL_DATABASE="postgres"
export BBS_DSQL_SCHEMA="public"
```

터미널 (웹):
```sh
npm run dev:web
```

브라우저: `http://localhost:5173`

현재 웹 클라이언트는 공개 게이트웨이 `https://api.kson.live`의 `/chol/*` API를 호출한다.

## 동작/제약(MVP)

- 닉네임 기반(완전 오픈), 로그인/계정은 추후
- 터미널 크기(rows/cols)는 **세션 시작 시 고정**, 이후 resize는 무시
  - 기본값: 80x24

## 커맨드

- 메인 메뉴: 메뉴 아이템 번호 선택, `0` 종료
- 글 목록: `N` 다음, `P` 이전, `R <no>` 읽기(현재 페이지 1부터), `W` 쓰기, `0` 뒤로
- 글 보기: `N` 다음 페이지, `P` 이전 페이지, `0` 뒤로
- 글 쓰기: 제목 → 본문 입력, `.` 단독 입력 시 완료

## 설정(환경변수)

- `BBS_CONFIG_PREFIX` (기본 `/chol/prod/bbs`; 다른 prefix를 쓰고 싶을 때만 지정)
- `BBS_CONFIG_REGION` (기본 `BBS_DSQL_REGION` 또는 `AWS_REGION`)
- `BBS_DSQL_HOST` (선택, 지정 시 SSM보다 우선)
- `BBS_DSQL_REGION` (기본 `ap-northeast-2`)
- `BBS_DSQL_USER` (기본 `admin`)
- `BBS_DSQL_DATABASE` (기본 `postgres`)
- `BBS_DSQL_SCHEMA` (기본 `public`)
- `BBS_DSQL_MAX_CONNECTIONS` (기본 `10`)
- `BBS_SESSION_TTL_MS` (기본 30분)
