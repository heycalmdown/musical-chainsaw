# Conference Structure

## 목적

이 문서는 `test-bbs`의 `conference` 구조를 설명한다. 특히 사용자가 처음 보는 `welcome message`와 실제 탐색 허브 역할을 하는 `menu text`의 역할 분리를 중심으로 정리한다.

## 핵심 개념

`conference`는 이 시스템의 최상위 탐색 단위다. 각 conference는 단순 카테고리가 아니라 아래 요소를 함께 가진다.

- welcome 화면
- menu 화면
- menu item 목록
- board 목록

즉, conference 하나가 작은 BBS 섹션처럼 동작한다.

## Conference가 가지는 주요 필드

- `name`
- `isRoot`
- `welcomeTitle`
- `welcomeBody`
- `menuTitle`
- `menuBody`
- `updatedAt`
- `updatedBy`

이 중 사용자 경험에 직접 영향을 주는 필드는 `welcomeTitle`, `welcomeBody`, `menuTitle`, `menuBody`다.

## 화면 구조

사용자 흐름은 기본적으로 아래 순서를 따른다.

1. 세션 시작
2. root conference의 welcome 화면 표시
3. 아무 키 입력
4. 해당 conference의 menu 화면 표시
5. 메뉴 번호 입력으로 board/page/link/conference 이동

하위 conference로 이동해도 같은 패턴을 반복한다.

## Welcome Message

### 역할

welcome message는 사용자가 conference에 "들어왔음"을 느끼게 하는 진입 화면이다.

- 섹션 소개
- 공지
- 분위기 설명
- 운영자 메시지

같은 정보를 담는 데 적합하다.

### 구성

welcome 화면은 두 부분으로 구성된다.

- `welcomeTitle`
- `welcomeBody`

렌더링 규칙은 다음과 같다.

- `welcomeTitle`이 있으면 제목을 먼저 보여준다
- `welcomeBody`가 있으면 terminal 폭에 맞춰 자동 줄바꿈해서 보여준다
- 둘 다 비어 있으면 `(no welcome message)`를 보여준다
- 마지막에는 `Last updated` 정보와 `Press any key to continue.`가 붙는다

즉, welcome은 "읽고 지나가는 소개 화면"이다.

### 편집 방식

welcome 편집은 title과 body를 분리해서 수행한다.

1. 제목 입력
2. 본문 multiline 입력
3. `.` 단독 입력으로 저장
4. `0` 입력으로 취소

본문은 여러 줄로 저장되며, 화면에서는 terminal 너비에 맞게 다시 감싸서 표시된다.

## Menu Text

### 역할

menu text는 conference의 실제 탐색 화면을 커스터마이즈하기 위한 본문이다.

welcome이 "소개"라면, menu text는 "이 안에서 무엇을 선택할지 보여주는 메뉴 스킨"에 가깝다.

여기에 넣기 좋은 정보는 다음과 같다.

- 번호가 포함된 BBS 스타일 메뉴 디자인
- 섹션별 안내 문구
- 운영 규칙
- 선택을 유도하는 배치 텍스트

### 구성

menu 화면 관련 필드는 아래 두 개다.

- `menuTitle`
- `menuBody`

다만 실제 렌더링에서 핵심은 `menuBody`다.

### 예시

아래는 전형적인 BBS 스타일 메뉴 이미지를 `menuBody`에 넣을 수 있는 플레인 텍스트 예시로 옮긴 것이다.

```text
 /천/리/안/ ─────┐                                 SINCE 1985 ┐
 CHOLLIAN       │                    http://www.chollian.net │
────────────────┘ ───────────────────────────────────────────┘

 1. Today         │ 11. Public Data    21. News/Journal
 2. Events        │ 12. E-Mail         22. Jobs/Edu

 3. Find Info     │ 13. Chat Room      23. Life/Health
 4. Online City   │ 14. Boards/Talk    24. Stocks/Bank
 5. Help Desk     │ 15. Clubs          25. Real Estate
 ─────────────────┘ 16. Internet       26. Info Biz
                    17. Global Info    27. Startups
─────────────────────────────────────────────────────────────
       ▶ 71. Youth Special "Event Parade"   00. Hit Songs MP3
       ▶ 72. College Entrance Guide         Blue day
                                            I Believe

Special Deal !!!!!!!!!!!!!! ───────────────────────┐
┌──────────────────────────────────────────────────┘
└──────────────────────────────▶ What is it?

Lowest fee in Korea - Meet Dongbu at Housing Bank
Find(FIND,FF) Go(GO) Reconnect(LOG) Exit(X,BYE) Misc(Z)
Select> X
```

이런 형태의 문자열을 `menuBody`에 넣으면 conference 메뉴 화면이 기본 리스트 대신 커스텀 BBS 홈처럼 보이게 된다.
코드 에디터에서는 한글과 유니코드 선을 함께 사용할 때 폭이 딱 떨어지지 않기 때문에 영어로 예제 메뉴를 구성했다. 터미널에서는 잘 보인다.

### 렌더링 우선순위

현재 구현은 `menuBody`가 비어 있는지 여부를 기준으로 menu 화면을 두 가지 방식으로 렌더링한다.

#### 1. `menuBody`가 비어 있지 않은 경우

- `menuBody`의 줄들을 그대로 출력한다
- 메뉴 아이템 리스트는 화면에 그리지 않는다
- `menuTitle`도 별도 헤더로 출력하지 않는다
- hints도 표시하지 않는다

이 모드에서는 conference가 완전히 커스텀한 BBS 메뉴 화면처럼 보인다.

#### 2. `menuBody`가 비어 있는 경우

- 기본 메뉴 화면을 렌더링한다
- 헤더에 conference 이름과 `menuTitle`을 보여준다
- visible menu item 목록을 보여준다
- 각 항목은 `displayNo`, `label`, `displayType` 조합으로 출력된다
- 하단 hints에 `<num>=Open`, `0=Back/Exit`가 표시된다

즉, `menuBody`는 "기본 메뉴 리스트 UI를 덮어쓰는 커스텀 메뉴 문자열"로 이해하면 된다.

## Menu Text와 Menu Items의 관계

초기 설계 원칙과 현재 구현은 모두 menu text와 menu items를 별개 데이터로 본다.

- `menuBody`는 화면 디자인용 문자열
- menu items는 실제 이동 가능한 액션 목록

따라서 둘은 서로 대체 관계가 아니라 분리된 두 레이어다.

### 중요한 점

현재 코드 기준으로 `menuBody`가 있어도 menu item 데이터는 그대로 유지된다. 화면에서 목록만 감춰질 뿐, menu 상태에서는 숫자 입력으로 item 선택이 계속 가능하다.

즉:

- `menuBody`는 시각적 표현을 바꾼다
- 실제 라우팅 대상은 여전히 menu items가 담당한다

이 특성 덕분에 운영자는 메뉴를 자유롭게 꾸미면서도 실제 이동 구조는 item 데이터로 안정적으로 유지할 수 있다.
단, `menuBody`는 단순한 텍스트일뿐으로 메뉴에서 사용한 번호와 실제 menu items가 일치하지 않을 수 있다. 이 연결의 책임은 `menuBody`의 디자이너에게 달려있다.

## Menu Item 구조

각 menu item은 아래 성격을 가진다.

- `label`: 기본 메뉴에서 보이는 이름
- `displayNo`: 표시용 번호 문자열
- `displayType`: 표시용 타입 문자열
- `actionType`: 실제 동작 종류
- `actionRef`: 실제 대상
- `body`: page 타입일 때 본문
- `hidden`: 기본 리스트 노출 여부

지원되는 `actionType`은 다음 네 가지다.

- `board`
- `page`
- `link`
- `conference`

## 액션 타입별 의미

### `board`

- conference 내부 board로 이동
- 이후 글 목록과 글 읽기/쓰기 흐름으로 연결

### `page`

- 정적 페이지를 연다
- `actionRef`는 페이지 제목
- `body`는 페이지 본문

### `link`

- 외부 URL 정보를 보여준다
- terminal 안에서 직접 열지는 않고 URL 문자열만 안내한다

### `conference`

- 다른 conference의 welcome 화면으로 이동한다
- 즉, conference 간 연결도 menu item으로 모델링된다

## Welcome과 Menu의 역할 분리

두 화면은 비슷해 보이지만 의도가 다르다.

### Welcome

- 진입 시 1회 읽는 소개 화면
- 읽고 나면 아무 키로 다음 단계로 넘어감
- 설명, 브랜딩, 공지에 적합

### Menu

- 실제 탐색 허브
- 반복적으로 돌아오는 화면
- board/page/link/conference 이동의 기준점

실무적으로는 아래처럼 구분하는 편이 좋다.

- `welcomeBody`: "여기는 어떤 곳인가"
- `menuBody`: "여기서 무엇을 선택할 것인가"

## Root Conference

root conference도 특별 UI가 아니라 같은 구조를 쓴다.

- root도 welcome을 가진다
- root도 menu를 가진다
- root menu에서 다른 conference나 board로 진입할 수 있다
- 차이는 `0` 입력 시 root에서는 종료, 일반 conference에서는 뒤로 가기라는 점 정도다

## 운영 관점 권장 사용법

### welcome message에 적합한 내용

- 서버 소개
- 세계관/주제 설명
- 공지
- 첫 방문자 안내

### menu text에 적합한 내용

- ASCII 스타일 메뉴
- 번호가 들어간 배치 텍스트
- 섹션 안내
- 선택 유도 문구

### menu item에 적합한 내용

- 실제 이동 구조
- board/page/link/conference 연결
- 숨김/노출 관리

## 구현 기준 메모

현재 설명의 기준 소스는 아래 파일들이다.

- [docs/PRD.md](/Users/kson/Development/test/test-bbs/docs/PRD.md)
- [session.ts](/Users/kson/Development/test/test-bbs/src/ui/session.ts)
- [db.ts](/Users/kson/Development/test/test-bbs/src/db.ts)
