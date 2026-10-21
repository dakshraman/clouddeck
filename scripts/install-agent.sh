#!/usr/bin/env bash
#
# CloudDeck agent installer for Ubuntu/Debian (systemd) servers.
#
# Phases:
#   1. root check     — /etc writes, systemd and nginx configs require root.
#   2. architecture   — map uname -m to a release artifact name.
#   3. acquire binary — build from a repo checkout, use a prebuilt binary
#                       from agent/bin, or download a released artifact.
#   4. install        — /usr/local/bin/clouddeck-agent (mode 0755).
#   5. config         — /etc/clouddeck/agent.env (created once, never clobbered).
#   6. directories    — agent state dir + site webroot.
#   7. systemd unit   — installed, enabled and started.
#   8. hints          — health check, nginx, certbot.
#
# Usage:
#   sudo ./scripts/install-agent.sh
#   # or, once the repo URL below is real, straight from the web:
#   curl -fsSL https://raw.githubusercontent.com/CHANGE_ME/clouddeck/main/scripts/install-agent.sh | sudo bash

set -euo pipefail

# ---------------------------------------------------------------------------
# 1. Root check
# ---------------------------------------------------------------------------
if [[ "${EUID}" -ne 0 ]]; then
  echo "error: run as root — the installer writes /etc and manages systemd." >&2
  echo "       try: sudo $0" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Architecture detection (release artifacts use GOARCH-style names)
# ---------------------------------------------------------------------------
case "$(uname -m)" in
  x86_64)          ARCH="linux-amd64" ;;
  aarch64 | arm64) ARCH="linux-arm64" ;;
  *)
    echo "error: unsupported architecture: $(uname -m) (expected x86_64 or aarch64)" >&2
    exit 1
    ;;
esac
echo "==> architecture: ${ARCH}"

# ---------------------------------------------------------------------------
# 3. Acquire the binary
# ---------------------------------------------------------------------------
# Resolve this script's directory so a repo checkout can be detected. When the
# script is piped to bash there is no file path and we fall back to $PWD.
SCRIPT_PATH="${BASH_SOURCE[0]:-}"
if [[ -n "${SCRIPT_PATH}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"
else
  SCRIPT_DIR="$(pwd)"
fi
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

BIN_SRC=""
TMP_DIR=""

if [[ -f "${REPO_DIR}/agent/go.mod" ]]; then
  # (a) Repo checkout detected (the script lives in <repo>/scripts).
  echo "==> repo checkout detected at ${REPO_DIR}"

  if command -v go >/dev/null 2>&1 \
     && go env GOVERSION 2>/dev/null | grep -Eq '^go1\.(2[3-9]|[3-9][0-9])'; then
    echo "==> building agent from source ($(go version))"
    ( cd "${REPO_DIR}/agent" && go build -trimpath -ldflags "-s -w" -o bin/clouddeck-agent ./cmd/clouddeck-agent )
    BIN_SRC="${REPO_DIR}/agent/bin/clouddeck-agent"
  elif [[ -f "${REPO_DIR}/agent/bin/clouddeck-agent" ]]; then
    echo "==> Go 1.23+ not found; using prebuilt agent/bin/clouddeck-agent"
    BIN_SRC="${REPO_DIR}/agent/bin/clouddeck-agent"
  else
    echo "error: no Go 1.23+ toolchain and no prebuilt agent/bin/clouddeck-agent." >&2
    echo "       install Go 1.23+ from https://go.dev/dl/ or build the agent locally first." >&2
    exit 1
  fi
else
  # (b) No checkout — download a released binary.
  #
  # PLACEHOLDER: CHANGE_ME must be replaced with the real GitHub owner once
  # releases exist. Until then, this branch only works for published releases.
  RELEASE_BASE="https://github.com/CHANGE_ME/clouddeck/releases/latest/download"
  BIN_URL="${RELEASE_BASE}/clouddeck-agent-${ARCH}"
  echo "==> downloading ${BIN_URL}"
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "${TMP_DIR}"' EXIT
  curl -fsSL "${BIN_URL}" -o "${TMP_DIR}/clouddeck-agent"
  BIN_SRC="${TMP_DIR}/clouddeck-agent"
fi

# ---------------------------------------------------------------------------
# 4. Install the binary
# ---------------------------------------------------------------------------
# Stop a previous install so the running binary can be replaced on upgrade.
systemctl stop clouddeck-agent >/dev/null 2>&1 || true
install -m 0755 "${BIN_SRC}" /usr/local/bin/clouddeck-agent
echo "==> installed /usr/local/bin/clouddeck-agent"

# ---------------------------------------------------------------------------
# 5. Configuration (/etc/clouddeck/agent.env)
# ---------------------------------------------------------------------------
mkdir -p /etc/clouddeck
if [[ ! -f /etc/clouddeck/agent.env ]]; then
  cat > /etc/clouddeck/agent.env <<'EOF'
# CloudDeck agent configuration (read by systemd via EnvironmentFile).
# The v0.1 agent API has NO authentication — keep it on loopback only.
AGENT_LISTEN=127.0.0.1:9090
AGENT_STATE_DIR=/var/lib/clouddeck-agent
AGENT_NGINX_SITES_DIR=/etc/nginx/conf.d
AGENT_WEBROOT=/www/wwwroot
# App hosting supervisor: systemd (default), pm2 or supervisor.
# AGENT_APP_SUPERVISOR=systemd
# AGENT_APP_SUPERVISOR_DIR=/etc/supervisor/conf.d
EOF
  echo "==> wrote /etc/clouddeck/agent.env"
else
  echo "==> kept existing /etc/clouddeck/agent.env"
fi

# ---------------------------------------------------------------------------
# 6. Directories
# ---------------------------------------------------------------------------
mkdir -p /var/lib/clouddeck-agent /www/wwwroot

# ---------------------------------------------------------------------------
# 7. systemd unit
# ---------------------------------------------------------------------------
cat > /etc/systemd/system/clouddeck-agent.service <<'EOF'
[Unit]
Description=CloudDeck agent (privileged host worker)
After=network.target nginx.service
Wants=nginx.service

[Service]
# Root is required: the agent rewrites /etc/nginx/conf.d, reloads nginx and
# runs certbot to issue SSL certificates.
User=root
EnvironmentFile=-/etc/clouddeck/agent.env
ExecStart=/usr/local/bin/clouddeck-agent
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now clouddeck-agent
echo "==> clouddeck-agent.service enabled and started"

# ---------------------------------------------------------------------------
# 8. Hints
# ---------------------------------------------------------------------------
echo
echo "CloudDeck agent is installed. Next steps:"
echo "  * Verify it is healthy:    curl -fsS http://127.0.0.1:9090/v1/health"
echo "  * nginx serves your sites: sudo apt-get install -y nginx"
echo "  * SSL needs certbot:       sudo apt-get install -y certbot"
echo "  * Panel + TLS guide:       docs/deployment.md"
