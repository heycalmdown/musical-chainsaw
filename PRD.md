PRD — SSH Classic BBS-Style (MVP)

Goal
	•	Run a text-based BBS instead of bash on SSH login
	•	Classic BBS-style, menu-driven UI (number-based navigation)
	•	Board only (no chat)
	•	Local Unix domain socket IPC

Scope

In
	•	SSH → auto-run bbs
	•	ANSI fullscreen UI (clear + redraw)
	•	Boards: list / post list / read / write
	•	User identity = SSH username
	•	IPC via Unix domain socket

Out
	•	Chat, comments
	•	Edit / delete
	•	Search
	•	Roles / permissions
	•	Attachments
	•	Web UI

Architecture

SSH Client
  → sshd
    → bbs (per-session TUI)
      → Unix socket
        → bbsd (daemon)
          → sqlite

Components

bbs (TUI)
	•	ANSI rendering
	•	Line-based input
	•	Menu and page navigation
	•	Request/response to daemon

bbsd (Daemon)
	•	Unix socket server
	•	Board/post read + create
	•	sqlite storage

UX
	•	Number-based main menu
	•	Post list commands: N / P / R / 0
	•	Post view with simple paging
	•	Write flow: title + body, . to finish

Features
	•	listBoards
	•	listPosts(boardId, page, pageSize)
	•	getPost(postId)
	•	createPost(boardId, title, body, author)

IPC Protocol
	•	JSON Lines (1 message per line)
	•	Request / response matched by id

Example:

{ "id": 1, "type": "listBoards", "payload": {} }

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
	•	ForceCommand to run bbs
	•	Restricted Unix socket permissions

Milestones
	1.	Daemon + schema
	2.	TUI read flow
	3.	Write flow
	4.	Ops setup