#!/bin/sh
set -eu

python3 /app/database/server.py &
api_pid=$!

cleanup() {
  kill "$api_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

exec node /app/node_modules/vinext/dist/cli.js start --hostname 0.0.0.0 --port 3000
