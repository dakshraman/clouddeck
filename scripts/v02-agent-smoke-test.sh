#!/usr/bin/env bash
# CloudDeck v0.2 agent smoke test: file manager + MySQL management.
# Run on the machine where the agent runs, in REAL (non dry-run) mode.
# Creates one test site and one test database, exercises the APIs (including
# escape attempts), then removes everything it created.
#
# Usage: bash scripts/v02-agent-smoke-test.sh [base-url]   (default 127.0.0.1:9090)
set -euo pipefail

B="${1:-http://127.0.0.1:9090}"
D="v02test.clouddeck.test"
DB="cd_e2e_db"
DBU="cd_e2e_user"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
jget() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }
post() { curl -sS -X POST "$B$1" -H 'Content-Type: application/json' -d "$2"; }
code() { curl -sS -o /dev/null -w '%{http_code}' "$@"; }
expect_code() {
  local want="$1"; shift
  local got; got=$(code "$@")
  [ "$got" = "$want" ] || fail "expected HTTP $want, got $got: $*"
}

wait_task() {
  local task="$1" status="" t=""
  for _ in $(seq 1 40); do
    t=$(curl -sS "$B/v1/tasks/$task")
    status=$(echo "$t" | jget '["status"]')
    case "$status" in succeeded|failed) break;; esac
    sleep 0.5
  done
  echo "$t"
  [ "$status" = "succeeded" ]
}

echo "== 0. health + mysql status =="
curl -sS "$B/v1/health"; echo
curl -sS "$B/v1/mysql/status" | python3 -m json.tool

echo
echo "== 1. create test site $D =="
TASK=$(post /v1/sites "{\"domain\":\"$D\",\"phpVersion\":\"8.3\"}" | jget '["taskId"]')
wait_task "$TASK" >/dev/null || fail "site create task failed"
echo "ok"

echo
echo "== 2. file manager basic ops =="
F="$B/v1/sites/$D/files"
curl -sS "$F" | python3 -m json.tool
expect_code 201 -X POST "$F/mkdir" -H 'Content-Type: application/json' -d '{"path":"sub"}'
echo "mkdir ok"
expect_code 409 -X POST "$F/mkdir" -H 'Content-Type: application/json' -d '{"path":"sub"}'
echo "mkdir duplicate -> 409 ok"
expect_code 200 -X PUT "$F/content" -H 'Content-Type: application/json' -d '{"path":"sub/hello.txt","content":"hello v0.2"}'
echo "write ok"
GOT=$(curl -sS "$F/content?path=sub/hello.txt" | jget '["content"]')
[ "$GOT" = "hello v0.2" ] || fail "read mismatch: $GOT"
echo "read ok"
GOT=$(curl -sS "$F/download?path=sub/hello.txt")
[ "$GOT" = "hello v0.2" ] || fail "download mismatch: $GOT"
echo "download ok"

printf 'uploaded-body' > "$TMP/up.txt"
UP=$(curl -sS -X POST -F "file=@$TMP/up.txt" "$F/upload?path=sub")
[ "$(echo "$UP" | jget '["uploaded"][0]["name"]')" = "up.txt" ] || fail "upload failed: $UP"
echo "upload ok"
expect_code 409 -X POST -F "file=@$TMP/up.txt" "$F/upload?path=sub"
echo "upload duplicate -> 409 ok"
expect_code 200 -X POST -F "file=@$TMP/up.txt" "$F/upload?path=sub&overwrite=true"
echo "upload overwrite ok"

expect_code 200 -X POST "$F/rename" -H 'Content-Type: application/json' -d '{"from":"sub/up.txt","to":"sub/moved.txt"}'
echo "rename ok"
expect_code 404 -X POST "$F/rename" -H 'Content-Type: application/json' -d '{"from":"sub/nope.txt","to":"sub/x.txt"}'
echo "rename missing -> 404 ok"

curl -sS "$F?path=sub" | python3 -m json.tool

expect_code 200 -X DELETE "$F?path=sub/moved.txt"
echo "delete file ok"
expect_code 409 -X DELETE "$F?path=sub"
echo "delete non-empty dir -> 409 ok"
expect_code 200 -X DELETE "$F?path=sub&recursive=true"
echo "delete recursive ok"

echo
echo "== 3. file manager escape attempts =="
expect_code 400 "$F?path=../"
expect_code 400 "$F?path=/etc"
expect_code 400 "$F/content?path=../../etc/passwd"
expect_code 400 -X PUT "$F/content" -H 'Content-Type: application/json' -d '{"path":"../evil.txt","content":"x"}'
echo "traversal blocked ok"

ROOT_WR="/www/wwwroot/$D"
if [ -w "$(dirname "$ROOT_WR")" ]; then
  ln -sfn /etc "$ROOT_WR/trap"
  C=$(code "$F?path=trap")
  [ "$C" != "200" ] || fail "listing through symlink returned 200"
  echo "symlink list blocked (http $C) ok"
  expect_code 409 "$F/content?path=trap/passwd"
  echo "symlink content blocked ok"
  expect_code 200 -X DELETE "$F?path=trap"
  if [ -L "$ROOT_WR/trap" ]; then fail "symlink still present after delete"; fi
  echo "symlink delete (link only) ok"
else
  echo "skip symlink test (no write access to $(dirname "$ROOT_WR"))"
fi

echo
echo "== 4. mysql management =="
STATUS=$(curl -sS "$B/v1/mysql/status")
echo "$STATUS" | python3 -m json.tool
[ "$(echo "$STATUS" | jget '["available"]')" = "True" ] || fail "mysql not available - check AGENT_MYSQL_* env"

expect_code 201 -X POST "$B/v1/mysql/databases" -H 'Content-Type: application/json' -d "{\"name\":\"$DB\"}"
echo "create db ok"
expect_code 409 -X POST "$B/v1/mysql/databases" -H 'Content-Type: application/json' -d "{\"name\":\"$DB\"}"
echo "duplicate db -> 409 ok"
expect_code 400 -X POST "$B/v1/mysql/databases" -H 'Content-Type: application/json' -d '{"name":"mysql"}'
echo "system schema -> 400 ok"
expect_code 400 -X POST "$B/v1/mysql/databases" -H 'Content-Type: application/json' -d '{"name":"bad-name"}'
echo "invalid name -> 400 ok"

CU=$(curl -sS -X POST "$B/v1/mysql/users" -H 'Content-Type: application/json' -d "{\"user\":\"$DBU\"}")
echo "$CU" | jget '["user"]' >/dev/null || fail "create user failed: $CU"
GEND=$(echo "$CU" | jget '["password"]')
[ "${#GEND}" -eq 20 ] || fail "expected generated 20-char password, got ${#GEND} chars"
echo "create user ok (generated password, 20 chars)"
expect_code 409 -X POST "$B/v1/mysql/users" -H 'Content-Type: application/json' -d "{\"user\":\"$DBU\"}"
echo "duplicate user -> 409 ok"
expect_code 400 -X POST "$B/v1/mysql/users" -H 'Content-Type: application/json' -d '{"user":"root"}'
echo "system user -> 400 ok"

expect_code 200 -X POST "$B/v1/mysql/grants" -H 'Content-Type: application/json' -d "{\"user\":\"$DBU\",\"database\":\"$DB\",\"privileges\":\"all\"}"
echo "grant ok"
expect_code 404 -X POST "$B/v1/mysql/grants" -H 'Content-Type: application/json' -d "{\"user\":\"$DBU\",\"database\":\"cd_no_such_db\",\"privileges\":\"all\"}"
echo "grant missing db -> 404 ok"

MB="${AGENT_MYSQL_BIN:-}"
if [ -n "$MB" ] && [ -x "$MB" ]; then
  GR=$(MYSQL_PWD="${AGENT_MYSQL_ROOT_PASSWORD:-}" "$MB" -u "${AGENT_MYSQL_ROOT_USER:-root}" -N --batch -e "SHOW GRANTS FOR '$DBU'@'localhost'")
  case "$GR" in *"$DB"*) echo "direct grant verification ok";; *) fail "grant not found via direct query: $GR";; esac
else
  echo "skip direct grant verification (set AGENT_MYSQL_BIN to enable)"
fi

curl -sS "$B/v1/mysql/databases" | python3 -m json.tool
curl -sS "$B/v1/mysql/users" | python3 -m json.tool

expect_code 200 -X DELETE "$B/v1/mysql/users/$DBU?host=localhost"
echo "delete user ok"
expect_code 200 -X DELETE "$B/v1/mysql/databases/$DB"
echo "delete db ok"
expect_code 404 -X DELETE "$B/v1/mysql/databases/$DB"
echo "delete gone -> 404 ok"
expect_code 400 -X DELETE "$B/v1/mysql/databases/mysql"
echo "drop system schema -> 400 ok"

echo
echo "== 5. delete test site =="
DTASK=$(curl -sS -X DELETE "$B/v1/sites/$D" | jget '["taskId"]')
wait_task "$DTASK" >/dev/null || fail "site delete task failed"
expect_code 404 "$F"
echo "files endpoint on deleted site -> 404 ok"

echo
echo "ALL V0.2 TESTS PASSED"
