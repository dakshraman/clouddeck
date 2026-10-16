#!/usr/bin/env bash
# CloudDeck agent smoke test — API level.
# Run against a running agent. Exits non-zero on the first unexpected result.
# Usage: bash agent-smoke-test.sh [base-url]   (default http://127.0.0.1:9090)
set -euo pipefail

BASE="${1:-http://127.0.0.1:9090}"
DOMAIN="demo.clouddeck.test"

api_json() { curl -sS -H 'Content-Type: application/json' "$@"; }
py_field() { python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
wait_task() {
  local task="$1" status="" t=""
  for _ in $(seq 1 30); do
    t=$(api_json "$BASE/v1/tasks/$task")
    status=$(echo "$t" | py_field status)
    case "$status" in succeeded|failed) break;; esac
    sleep 0.5
  done
  echo "$t"
  [ "$status" = "succeeded" ]
}

echo "-- health --"
api_json "$BASE/v1/health" | python3 -m json.tool

echo "-- invalid domain is rejected (expect 400) --"
CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/sites" -H 'Content-Type: application/json' -d '{"domain":"-bad_domain-","phpVersion":"8.3"}')
[ "$CODE" = "400" ] || { echo "FAIL: expected 400, got $CODE"; exit 1; }
echo "ok (400)"

echo "-- create site $DOMAIN --"
TASK=$(api_json -X POST "$BASE/v1/sites" -H 'Content-Type: application/json' -d "{\"domain\":\"$DOMAIN\",\"phpVersion\":\"8.3\"}" | py_field taskId)
echo "task: $TASK"
wait_task "$TASK" | python3 -m json.tool || { echo "FAIL: create task did not succeed"; exit 1; }

echo "-- duplicate create is rejected (expect 409) --"
CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/v1/sites" -H 'Content-Type: application/json' -d "{\"domain\":\"$DOMAIN\",\"phpVersion\":\"8.3\"}")
[ "$CODE" = "409" ] || { echo "FAIL: expected 409, got $CODE"; exit 1; }
echo "ok (409)"

echo "-- sites list --"
api_json "$BASE/v1/sites" | python3 -m json.tool

echo "-- php versions --"
api_json "$BASE/v1/php/versions" | python3 -m json.tool

echo "-- delete site --"
DTASK=$(api_json -X DELETE "$BASE/v1/sites/$DOMAIN" | py_field taskId)
wait_task "$DTASK" > /dev/null || { echo "FAIL: delete task did not succeed"; exit 1; }
echo "deleted"

echo "ALL OK"
