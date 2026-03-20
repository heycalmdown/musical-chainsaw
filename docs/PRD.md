# PRD - test-bbs

## 문서 목적

이 문서는 `test-bbs`의 현재 구현 상태를 기준으로 MVP 범위와 제품 동작을 정리한다. 과거 단일 게시판 MVP 문서와 달리, 현재 구현은 `conference` 중심 구조와 메뉴 편집 기능을 포함한다.

## 제품 개요

- 브라우저에서 접속하는 텍스트 기반 BBS 스타일 애플리케이션
- 클라이언트는 `xterm.js`로 터미널 화면을 렌더링
- 서버는 세션 상태 머신이 매 입력마다 다음 `ScreenModel`을 생성하는 server-driven UI 구조
- 통신은 REST 기반이며, 배포 경로는 `/chol/*`

## 현재 사용자 가치

- 닉네임만으로 즉시 접속 가능
- 게시판 글 읽기/쓰기 가능
- `conference` 단위로 환영 메시지와 메뉴를 구성 가능
- 메뉴에서 게시판, 정적 페이지, 외부 링크, 다른 conference로 이동 가능

## 범위

### 포함

- 오픈 접속(닉네임 기반, 계정 없음)
- 세션 생성, 입력 이벤트 처리, 세션 종료
- conference 목록 관리
- conference welcome 메시지 조회/수정
- conference 메뉴 조회/수정
- 메뉴 아이템 타입
  - `board`
  - `page`
  - `link`
  - `conference`
- board 생성/이름 변경/삭제
- 게시글 목록 조회, 본문 조회, 글쓰기
- Aurora DSQL 기반 영속화
- 세션 TTL 및 optimistic concurrency(version) 처리

### 제외

- 로그인/권한/역할
- 댓글
- 게시글 수정/삭제
- 검색
- 첨부 파일
- 실시간 푸시 또는 채팅
- 세션 중 terminal resize 반영

## 정보 구조

현재 제품의 최상위 단위는 게시판이 아니라 `conference`이다.

- `Conference`
  - welcome title/body
  - menu title/body
  - root 여부
- `ConferenceMenuItem`
  - 표시용 번호(`displayNo`)
  - 표시용 타입(`displayType`)
  - 레이블(`label`)
  - 액션 타입(`board | page | link | conference`)
  - 액션 대상(`actionRef`)
  - 숨김 여부(`hidden`)
- `Board`
  - conference 소속 게시판
- `Post`
  - conference + board 소속 게시글

기본 시드 데이터는 root conference와 기본 conference/board를 자동 생성한다.

## 핵심 사용자 흐름

### 1. 접속

- 사용자는 닉네임을 입력해 세션을 생성한다.
- 서버는 root conference를 찾고 welcome 화면 또는 conference 관리 화면으로 진입시킨다.
- terminal 크기(`rows`, `cols`)는 세션 생성 시 고정된다.

### 2. conference 진입과 메뉴 탐색

- welcome 화면을 본 뒤 conference 메뉴로 이동한다.
- 메뉴는 번호 기반으로 탐색한다.
- root conference에서는 `0`이 종료이며, 하위 conference에서는 `0`이 뒤로 가기다.

### 3. 게시판 이용

- 메뉴 아이템이 `board`면 해당 board의 글 목록으로 이동한다.
- 글 목록 명령:
  - `N` 다음
  - `P` 이전
  - `R <no>` 읽기
  - `W` 쓰기
  - `0` 메뉴로 돌아가기
- 글 보기 명령:
  - `N` 다음 페이지
  - `P` 이전 페이지
  - `0` 뒤로
- 글쓰기:
  - 제목 입력
  - 본문 multiline 입력
  - `.` 단독 입력 시 완료
  - `0` 입력 시 취소

### 4. conference 운영

- conference 관리:
  - `A` 추가
  - `R <n>` 이름 변경
  - `D <n>` 삭제
- welcome 편집:
  - 제목 입력 후 본문 multiline 입력
- 메뉴 편집:
  - 메뉴 아이템 추가/삭제
  - 레이블, 표시 번호, 표시 타입 수정
  - 타겟 변경
  - 숨김 전환
- board 관리:
  - `A` 추가
  - `R <n>` 이름 변경
  - `D <n>` 삭제

## UX 원칙

- 매 입력 후 전체 화면을 다시 그리는 terminal UX
- 서버가 화면 상태를 완전히 결정하고 클라이언트는 이를 렌더링만 수행
- 입력 모드는 `line`과 `multiline` 두 가지
- 긴 본문과 page 콘텐츠는 terminal 크기에 맞춰 줄바꿈 및 페이지네이션 처리
- 링크는 terminal 내부에서 열지 않고 URL을 표시한다

## API

현재 공개 스펙 기준 경로는 `/chol/*` 이다.

- `GET /chol/health`
  - 응답: `{ ok: true }`
- `POST /chol/sessions`
  - 요청: `{ nickname, rows?, cols? }`
  - 응답: `{ sessionId, screen }`
- `POST /chol/sessions/{sessionId}/events`
  - 요청: `{ input }`
  - 응답: `{ screen }`
- `DELETE /chol/sessions/{sessionId}`
  - 응답: `{ ok, deleted }`

`screen`은 다음 필드를 가진다.

- `title`
- `lines`
- `prompt`
- `inputMode`
- `hints?`
- `toast?`
- `actions?`

## 시스템 구조

### 배포 구조

- Web client: `web/`의 Vite + `xterm.js`
- API runtime: AWS Lambda handlers
- API contract: TypeSpec / OpenAPI 산출물
- Database: Aurora DSQL
- Session store: Aurora DSQL `sessions` 테이블

### 로컬 개발 구조

- 로컬 개발은 Vite 웹 클라이언트 중심으로 수행한다
- 웹 클라이언트는 현재 공개 게이트웨이 `https://api.kson.live`의 `/chol/*` API를 호출한다

## 데이터 저장 원칙

- 게시판/메뉴/게시글/세션을 관계형 스키마로 저장
- 세션은 직렬화된 UI 상태와 version을 함께 저장
- 세션 갱신은 compare-and-set 방식으로 충돌을 감지
- 세션 만료 시간(`TTL`)이 지나면 조회 시 제거한다

## 비기능 요구사항

- Node.js `22+`
- 세션 TTL 기본값 30분
- terminal 기본 크기 80x24
- nickname은 제어문자를 제거하고 20자 이하로 제한
- 입력 payload 크기 제한 존재
  - 세션 생성 body 최대 64KB
  - 이벤트 body 최대 128KB
  - 단일 input 최대 2000자

## 구현 메모

- 문서와 코드가 다를 경우 현재 기준 소스는 `src/ui/session.ts`, `src/api.ts`, `src/db.ts`, `src/session-store.ts`이다.
- 과거 문서에 있던 DynamoDB, systemd 운영, WebSocket 확장 계획은 현재 구현 기준 핵심 범위가 아니다.
- conference의 welcome/menu 구조 설명은 [conference-structure.md](/Users/kson/Development/test/test-bbs/docs/conference-structure.md)를 참고한다.
