# ANSI 서브셋 기반 화면 모델 및 운영자 마크업 v1 계획

## Summary
운영자 작성 고정 화면(`welcome/menu/page`)은 BBCode 유사 마크업 원문을 그대로 저장한다. 저장 시점에 한 번 파싱/검증해서 ANSI 서브셋 밖의 표현은 거부한다. API의 wire format은 ANSI code가 아니라 `ansiIr` JSON이며, 웹 클라이언트가 `ansiIr -> ANSI code -> xterm.js` 렌더를 담당한다. 일반 사용자 입력과 게시글은 계속 평문이다.

흐름은 아래로 고정한다.

```text
운영자 입력 마크업 -> validate/parse -> 마크업 원문 저장
                                     -> API 응답 시 ansiIr 생성
                                     -> 클라이언트가 ANSI code로 렌더
```

## Storage / Wire / Render
- 저장 포맷
  - 운영자 고정 화면 본문은 validated markup 원문 그대로 저장한다.
  - 예: `[clear]\n[fg=blue]공지[/fg]\n[inv]선택[/inv]`
- wire format
  - 서버는 전체 화면을 `ansiIr` JSON으로 내려준다.
  - `ansiIr`는 ANSI 표현력의 서브셋만 담는다.
- 최종 렌더
  - 클라이언트가 `ansiIr`를 ANSI escape sequence 문자열로 변환하고 `xterm.js`에 전달한다.

## ANSI IR
`ansiIr`는 문자열이 아니라 구조체 배열이다. v1 지원 범위는 `글자색`, `반전`, `전체 화면 지우기`만 포함한다.

```ts
type AnsiColor =
  | "default"
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white";

type TextSpan = {
  text: string;
  fg?: AnsiColor;
  inverse?: boolean;
};

type ScreenNode =
  | { type: "clearScreen" }
  | { type: "line"; spans: TextSpan[] };

type StoredRichScreen = ScreenNode[];
```

JSON 예시:

```json
[
  { "type": "clearScreen" },
  {
    "type": "line",
    "spans": [
      { "text": "Nownuri ", "fg": "blue" },
      { "text": "HOT", "inverse": true }
    ]
  },
  {
    "type": "line",
    "spans": [
      { "text": "http://example.com", "fg": "cyan" }
    ]
  }
]
```

이 JSON은 ANSI 서브셋 IR이므로 아래처럼 ANSI code로 렌더 가능하다.

```text
\x1b[2J\x1b[H\x1b[34mNownuri \x1b[0m\x1b[7mHOT\x1b[0m\r\n\x1b[36mhttp://example.com\x1b[0m\r\n
```

## Operator Markup
- 허용 태그
  - 색: `[fg=red]텍스트[/fg]`
  - 반전: `[inv]텍스트[/inv]`
  - 화면 지우기: `[clear]`
- 허용 색상
  - `default`, `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`
- 평문과 마크업은 같은 필드 안에서 혼용 가능
- 지원되지 않는 `[...]` 형태는 일반 평문으로 취급한다. 예: `[ 기본서비스 ]`
- 실제 태그로 쓰고 싶은 경우만 허용 태그 문법을 맞춘다
- `[` 문자를 명시적으로 이스케이프하려면 `\[`
- 저장 전 validation 규칙
  - 허용되지 않은 태그/속성/색상은 거부
  - 닫히지 않은 태그, 잘못 닫힌 태그는 거부
  - ANSI 서브셋으로 매핑 불가능한 구조는 거부

## Server / Client Responsibilities
- 서버
  - 운영자 입력 마크업을 validate 한다.
  - DB에는 validated markup 원문을 저장한다.
  - 응답 생성 시 markup을 `ansiIr`로 파싱해 전체 화면 wire format을 조립한다.
  - 시스템 UI와 평문 데이터도 같은 `ansiIr` 배열에 합성한다.
- 클라이언트
  - 응답의 `ansiIr`를 ANSI code로 렌더한다.
  - `xterm.js`에 최종 ANSI 문자열을 그대로 전달한다.
  - 입력 제어문자 차단은 계속 클라이언트에서 유지한다.

## Public API
- `ScreenModel`은 `ansi: string` 대신 `ansiIr: StoredRichScreen`를 가진다.
- `lines/prompt/hints/toast`는 디버그/보조 메타데이터로 유지할 수 있지만, 실제 터미널 렌더 기준은 `ansiIr`다.

응답 예시:

```json
{
  "screen": {
    "title": "BBS",
    "lines": ["[Conference: root]"],
    "prompt": "> ",
    "inputMode": "line",
    "hints": ["Commands: 0=Back"],
    "ansiIr": [
      { "type": "clearScreen" },
      {
        "type": "line",
        "spans": [{ "text": "[Conference: root]" }]
      },
      {
        "type": "line",
        "spans": [{ "text": "HOT", "inverse": true }]
      },
      {
        "type": "line",
        "spans": [{ "text": "> " }]
      }
    ]
  }
}
```

## Test Plan
- 마크업 validation 테스트
  - 정상 태그/색상 허용
  - 금지 태그/색상/미닫힘 태그 거부
- `markup -> ansiIr` 테스트
  - `[fg=red]`, `[inv]`, `[clear]`가 정확한 노드로 변환된다
  - 평문과 태그 혼합 순서가 보존된다
- 클라이언트 렌더 테스트
  - `ansiIr -> ANSI code` 결과가 색/반전/clear를 올바르게 반영한다
- 통합 테스트
  - 운영자가 저장한 마크업이 API에서 `ansiIr`로 내려오고, 웹에서 동일한 색/반전 결과를 본다

## Assumptions
- v1의 스타일 입력 대상은 운영자 작성 고정 화면(`welcome/menu/page`)만이다.
- 일반 게시글, 닉네임, 일반 사용자 입력은 평문 저장/출력 유지다.
- v1은 배경색, bold, underline, cursor move, line clear, animation을 지원하지 않는다.
- `ansiIr`는 앞으로 확장하더라도 ANSI 표현력 내부에서만 확장한다.
