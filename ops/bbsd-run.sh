#!/usr/bin/env bash
set -euo pipefail

# Intended to be used by systemd (see ops/test-bbsd.service)

REPO_DIR="${REPO_DIR:-/opt/test-bbs}"
SOCKET_PATH="${BBS_SOCKET_PATH:-/run/test-bbs/bbsd.sock}"
DB_PATH="${BBS_DB_PATH:-/var/lib/test-bbs/bbsd.sqlite3}"

export BBS_SOCKET_PATH="$SOCKET_PATH"
export BBS_DB_PATH="$DB_PATH"
cd "$REPO_DIR"
exec ./node_modules/.bin/tsx src/bbsd.ts

