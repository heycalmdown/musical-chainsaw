# test-bbs (MVP)

SSH 로그인 시 bash 대신 실행되는 클래식 BBS 스타일 TUI + daemon(`bbsd`) MVP.

구조:
- `bbs`: **thin client**(터미널 렌더링/입력 전송만)
- `bbsd`: 세션 상태 머신 + 화면 생성(Server‑Driven UI, `ui.hello`/`ui.event`)

## 요구사항

- Node.js **v22+** (`node:sqlite` 사용, Node 20 미지원)
- `tsx` (devDependency)

## 실행

```sh
npm install
```

터미널 1 (daemon):
```sh
npm run bbsd
```

터미널 2 (TUI):
```sh
npm run bbs
```

기본 경로:
- 소켓: `./var/bbsd.sock`
- DB: `./var/bbsd.sqlite3`

경로 변경:
```sh
BBS_SOCKET_PATH=./var/custom.sock BBS_DB_PATH=./var/custom.sqlite3 npm run bbsd
BBS_SOCKET_PATH=./var/custom.sock npm run bbs
```

## TUI 커맨드

- 메인 메뉴: 보드 번호 선택, `0` 종료
- 글 목록: `N` 다음, `P` 이전, `R <id>` 읽기, `W` 쓰기, `0` 뒤로
- 글 보기: `N` 다음 페이지, `P` 이전 페이지, `0` 뒤로
- 글 쓰기: 제목 → 본문 입력, `.` 단독 입력 시 완료

## SSH에 붙이기 (Linux 기준)

핵심은 2가지다:
- `bbsd`는 **systemd로 상시 실행**
- SSH 로그인 시 `bbs`를 **ForceCommand로 실행**

### 1) bbsd를 systemd로 띄우기

예시(권장): 소켓 접근 제어를 위해 `bbs` 그룹을 만들고, `bbsd`는 `bbs` 그룹으로 실행.

```sh
sudo groupadd bbs
sudo useradd -r -s /usr/sbin/nologin -g bbs bbsd
sudo mkdir -p /opt/test-bbs /var/lib/test-bbs
sudo chown -R bbsd:bbs /var/lib/test-bbs
```

서비스 파일 템플릿: `ops/test-bbsd.service:1`
- `/etc/systemd/system/test-bbsd.service`로 복사 후 경로 수정

```sh
sudo cp ops/test-bbsd.service /etc/systemd/system/test-bbsd.service
sudo chmod +x /opt/test-bbs/ops/bbsd-run.sh
sudo systemctl daemon-reload
sudo systemctl enable --now test-bbsd
```

### 2) SSH 로그인 시 bbs 자동 실행(ForceCommand)

`ops/bbs-login.sh:1`를 `/usr/local/bin/bbs-login`로 설치하고, sshd 설정에 ForceCommand를 건다.

```sh
sudo cp ops/bbs-login.sh /usr/local/bin/bbs-login
sudo chmod +x /usr/local/bin/bbs-login
```

sshd 설정 템플릿: `ops/sshd_match_group.conf:1`

```sh
sudo cp ops/sshd_match_group.conf /etc/ssh/sshd_config.d/test-bbs.conf
sudo sshd -t
sudo systemctl reload sshd
```

마지막으로 BBS에 접속할 계정을 `bbs` 그룹에 추가:
```sh
sudo usermod -aG bbs <username>
```
