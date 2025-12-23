# Conference + Custom Menu Plan (v2)

본 문서는 conference/board 구조와 **커스텀 메뉴 문자열** 요구사항을 반영한 실행 계획이다.
핵심: 메뉴 디자인(문자열)과 메뉴 아이템(액션 리스트)을 **완전히 분리**한다.

## 요구사항 요약

- conference는 여러 board를 보유하는 상위 subsystem
- welcome처럼 **menu text(커스텀 메뉴 문자열)** 제공 가능
- menu text가 **비어 있으면** 기존처럼 메뉴 아이템 리스트 표시
- menu text가 **있으면** 단순 문자열만 표시하고 **아이템 나열은 없음**
- 메뉴 디자인과 하위 아이템 관리는 **분리된 화면/플로우**
- 메뉴 디자인에 포함된 번호는 **그냥 문자열** (실제 선택 번호와 무관)
- hidden menu 가능: 리스트에 안 보여도 실제 번호로 접근 가능
- 유형(action_type)은 **수정 불가**
- 최초 접속(root)도 conference와 **동일 구조** (welcome + menu)
- edit 명령은 **힌트에 노출하지 않음** (E로 진입 가능)

## 메뉴 렌더링 규칙

1. 메뉴 화면 진입 시 `menu_body` 검사
   - `menu_body`가 **비어 있지 않음**:
     - menu text를 **그대로 출력** (공백/정렬 유지, 자동 래핑 없음)
     - 메뉴 아이템 리스트/힌트는 출력하지 않음
   - `menu_body`가 **비어 있음**:
     - 메뉴 아이템 리스트 출력
     - 각 아이템의 표시 문자열은 `display_no`, `label`, `display_type` 조합

2. 선택 번호 규칙
   - **실제 선택 번호**는 `sort_order` 기준 전체 아이템 순서(숨김 포함)
   - hidden 아이템은 리스트에 표시되지 않지만 번호로 선택 가능
   - menu text에 표시되는 번호 문자열은 **의미 없는 장식 문자열**

## 편집 진입 규칙 (숨김)

- 메뉴 화면에서:
  - `E`: 메뉴 디자인(menu text) 편집
  - `I`: 메뉴 아이템 관리
  - 위 명령은 **힌트에 표시하지 않음**

편집 화면 내부에서는 가이드/힌트 표시 가능.

## 데이터 모델 변경

`conferences`
- `is_root` INTEGER (0/1)
- `welcome_title`, `welcome_body`
- `menu_title`, `menu_body` (menu text)
- `updated_at`, `updated_by`

`conference_menu_items`
- `display_no` TEXT (표시용 번호 문자열)
- `display_type` TEXT (표시용 유형 문자열)
- `hidden` INTEGER (0/1)
- `action_type` TEXT (`board` | `page` | `link` | `conference`)
- `action_ref` TEXT (board id / url / conference id / page title)
- `body` TEXT (page 본문)

## UX/상태 흐름 (요약)

1. 세션 시작 → **root conference welcome**
2. 아무 키 → root menu
3. menu item 선택 → target 실행
   - `conference` 타입이면 해당 conference의 welcome으로 이동
4. 일반 conference의 메뉴에서도 동일한 규칙 적용

## 편집 플로우 (분리)

### A) 메뉴 디자인 편집 (menu text)
- 진입: 메뉴 화면에서 `E`
- 제목 입력 → 본문 멀티라인 입력(`.` 종료)
- 저장 시 `menu_title`, `menu_body`만 갱신
- **아이템 데이터와 독립적으로 관리**

### B) 메뉴 아이템 관리
- 진입: 메뉴 화면에서 `I`
- 기능: 추가/삭제/순서 변경/숨김 토글/표시 문자열 수정/타깃 수정
- `action_type` 변경은 불가 (타깃만 변경)

### C) 게시판 관리 (menu와 분리)
- 메뉴 아이템 관리 화면에서 진입
- board 추가/이름 변경/삭제

### D) conference 관리 (root 전용)
- root 메뉴 아이템 관리 화면에서 진입
- conference 추가/이름 변경/삭제 (삭제 시 하위 boards/posts/menu items cascade)

## 마이그레이션/시드

- root conference 생성 (없으면)
- 기존 boards는 기본 conference에 연결
- 기존 menu item은 `display_no`, `display_type` 빈 값으로 생성
- `menu_body`는 기본 빈 값

## 구현 단계

1. 스키마/도메인: `menu_body`, `display_no`, `display_type`, `hidden`, `is_root` 추가
2. DB 레이어: menu text 업데이트 API + item CRUD 확장
3. UI 상태머신:
   - menu text 렌더링 규칙 적용
   - 숨김 편집 진입(`E`, `I`)
   - menu text 편집 플로우 구현
4. 아이템 관리 화면 정리 (표시 문자열/숨김/타깃 편집)
5. root/menu/board/conference 관리 연결

## 체크리스트(수동 테스트)

- menu text 비어 있음 → 아이템 리스트 표시
- menu text 있음 → 문자열만 표시, 리스트 없음
- 선택 번호는 sort_order 기준(숨김 포함) 동작
- menu text 편집과 item 편집이 서로 영향 없음
- root 메뉴도 동일하게 동작
