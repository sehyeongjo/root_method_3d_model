#!/bin/zsh

cd "$(dirname "$0")" || exit 1

PORT=8000
while lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

LOG_FILE="/tmp/root-three-demo-${PORT}.log"
python3 -m http.server "${PORT}" --bind 127.0.0.1 >"${LOG_FILE}" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "${SERVER_PID}" >/dev/null 2>&1
}
trap cleanup EXIT INT TERM

sleep 1
open "http://127.0.0.1:${PORT}/"

echo "Root demo is running at:"
echo "http://127.0.0.1:${PORT}/"
echo
echo "This server is serving only:"
echo "$(pwd)"
echo
echo "Close this Terminal window or press Ctrl+C to stop the local server."

wait "${SERVER_PID}"
