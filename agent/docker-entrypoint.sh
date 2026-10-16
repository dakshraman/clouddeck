#!/bin/sh
# CloudDeck agent container entrypoint.
#
# One container runs two cooperating processes, mirroring the single-server
# deployment model: nginx serves the managed sites on :80, and the agent owns
# the typed API on :9090 plus everything under /etc/nginx/conf.d.
set -e

# Ensure mount points exist even if the runtime did not create them.
mkdir -p "${AGENT_WEBROOT:-/www/wwwroot}" "${AGENT_STATE_DIR:-/data}"

# Start nginx in the background. The agent shells out to `nginx -t` and
# `nginx -s reload`, so it needs a live nginx. It is fine if nginx starts
# slightly after the agent; the wait below keeps startup deterministic.
nginx -g "daemon off;" &

# Wait until :80 accepts connections (bounded — usually well under a second).
# curl without -f succeeds on any HTTP status, so a 404 still means "up".
i=0
while [ "${i}" -lt 10 ]; do
  if curl -sS -o /dev/null http://127.0.0.1:80/ 2>/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 0.5
done

# Replace the shell with the agent so it becomes PID 1 and receives SIGTERM
# from `docker stop` directly (no wrapper process to swallow signals).
exec clouddeck-agent
