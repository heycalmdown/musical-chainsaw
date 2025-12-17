#!/usr/bin/env bash
set -euo pipefail

# Copy to /usr/local/bin/bbs-login (or adjust sshd ForceCommand to point here)

REPO_DIR="${REPO_DIR:-/opt/test-bbs}"
SOCKET_PATH="${BBS_SOCKET_PATH:-/run/test-bbs/bbsd.sock}"

export BBS_SOCKET_PATH="$SOCKET_PATH"
cd "$REPO_DIR"
exec ./node_modules/.bin/tsx src/bbs.ts

