#!/bin/sh
# CloudDeck installer - one command, any Linux distro.
#
#   curl -fsSL https://github.com/dakshraman/clouddeck/releases/latest/download/install.sh | sudo bash
#
# Installs the CloudDeck agent (static binary) and panel (Node standalone
# bundle + pinned Node runtime) with no distro packages required: everything
# is downloaded with curl and unpacked with tar. Uses systemd when available,
# otherwise writes start/stop scripts.
#
# Flags:
#   --version vX.Y.Z     release to install (default: latest)
#   --prefix DIR         install dir (default: /opt/clouddeck)
#   --datadir DIR        state dir (default: /var/lib/clouddeck)
#   --etcdir DIR         config dir (default: /etc/clouddeck)
#   --agent-port N       agent port (default: 9090, binds 127.0.0.1)
#   --panel-port N       panel port (default: 3000, binds 0.0.0.0)
#   --gh-token TOKEN     GitHub token for downloading from a private repo
#   --no-agent           skip the agent
#   --no-panel           skip the panel
#   --no-systemd         force script mode even if systemd is present
#   --uninstall          stop and remove binaries + units (keeps data/config)
#   --purge              with --uninstall: also remove data dir
#
# POSIX sh on purpose: `curl ... | sh` works on Alpine and friends as well.
set -eu

REPO="dakshraman/clouddeck"
NODE_VERSION="22.11.0"

VERSION="latest"
PREFIX="/opt/clouddeck"
DATADIR="/var/lib/clouddeck"
ETCDIR="/etc/clouddeck"
AGENT_PORT="9090"
PANEL_PORT="3000"
GH_TOKEN="${CLOUDDECK_GH_TOKEN:-}"
DO_AGENT=1
DO_PANEL=1
FORCE_NO_SYSTEMD=0
UNINSTALL=0
PURGE=0

say()  { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# --- parse args --------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --version)     VERSION="$2"; shift 2 ;;
    --prefix)      PREFIX="$2"; shift 2 ;;
    --datadir)     DATADIR="$2"; shift 2 ;;
    --etcdir)      ETCDIR="$2"; shift 2 ;;
    --agent-port)  AGENT_PORT="$2"; shift 2 ;;
    --panel-port)  PANEL_PORT="$2"; shift 2 ;;
    --gh-token)    GH_TOKEN="$2"; shift 2 ;;
    --no-agent)    DO_AGENT=0; shift ;;
    --no-panel)    DO_PANEL=0; shift ;;
    --no-systemd)  FORCE_NO_SYSTEMD=1; shift ;;
    --uninstall)   UNINSTALL=1; shift ;;
    --purge)       PURGE=1; shift ;;
    -h|--help)
      cat <<'USAGE'
CloudDeck installer - one command, any Linux distro.

  curl -fsSL <release-url>/install.sh | sudo bash

Flags:
  --version vX.Y.Z     release to install (default: latest)
  --prefix DIR         install dir (default: /opt/clouddeck)
  --datadir DIR        state dir (default: /var/lib/clouddeck)
  --etcdir DIR         config dir (default: /etc/clouddeck)
  --agent-port N       agent port (default: 9090, binds 127.0.0.1)
  --panel-port N       panel port (default: 3000, binds 0.0.0.0)
  --gh-token TOKEN     GitHub token (private repos)
  --no-agent           skip the agent
  --no-panel           skip the panel
  --no-systemd         force script mode even if systemd is present
  --uninstall          stop and remove binaries + units (keeps data)
  --purge              with --uninstall: remove data + config too
USAGE
      exit 0
      ;;
    *)             die "unknown flag: $1 (see --help)" ;;
  esac
done

[ "$(id -u)" = "0" ] || die "must run as root:  curl ... | sudo bash"
command -v curl >/dev/null 2>&1 || die "curl is required to install"
command -v tar  >/dev/null 2>&1 || die "tar is required to install"

# --- architecture ------------------------------------------------------------
MACHINE="$(uname -m)"
case "$MACHINE" in
  x86_64|amd64)  ARCH_GO="amd64"; ARCH_NODE="x64" ;;
  aarch64|arm64) ARCH_GO="arm64"; ARCH_NODE="arm64" ;;
  *) die "unsupported architecture: $MACHINE (needs x86_64 or aarch64)" ;;
esac

# --- download helpers --------------------------------------------------------
download() { # download URL OUTFILE  (plain public download, e.g. nodejs.org)
  curl -fsSL -o "$2" "$1" || die "download failed: $1"
}

resolve_latest() { # sets VERSION to the latest tag
  [ "$VERSION" = "latest" ] || return 0
  if [ -n "$GH_TOKEN" ]; then
    VERSION="$(curl -fsSL -H "Authorization: token $GH_TOKEN" \
        "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
        | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  else
    VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
        | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  fi
  [ -n "$VERSION" ] || die "could not resolve the latest release (private repo without --gh-token?)"
}

release_json() { # fetch the release JSON for $VERSION
  if [ -n "$GH_TOKEN" ]; then
    curl -fsSL -H "Authorization: token $GH_TOKEN" "https://api.github.com/repos/$REPO/releases/tags/$VERSION"
  else
    curl -fsSL "https://api.github.com/repos/$REPO/releases/tags/$VERSION"
  fi
}

asset_id() { # asset_id FILENAME -> numeric id on stdout
  release_json | tr -d '\n ' \
    | sed -n "s/.*\"id\":\([0-9]*\),[^}]*\"name\":\"$1\".*/\1/p" | head -n 1
}

download_asset() { # download_asset FILENAME OUTFILE
  _name="$1"
  if [ -n "$GH_TOKEN" ]; then
    # private (or authenticated) repos: web download URLs do not accept tokens,
    # the release asset API does.
    _id="$(asset_id "$_name")"
    [ -n "$_id" ] || die "release asset $_name not found in $VERSION"
    curl -fsSL -H "Authorization: token $GH_TOKEN" -H "Accept: application/octet-stream" \
      -o "$2" "https://api.github.com/repos/$REPO/releases/assets/$_id" \
      || die "download failed: $_name"
  else
    curl -fsSL -o "$2" "https://github.com/$REPO/releases/download/$VERSION/$_name" \
      || die "download failed: $_name (private repo? pass --gh-token)"
  fi
}

systemd_present() {
  [ "$FORCE_NO_SYSTEMD" = "0" ] && [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1
}

random_hex() { # random_hex BYTES
  od -An -N "$1" -tx1 /dev/urandom | tr -d ' \n'
}

# --- uninstall ---------------------------------------------------------------
if [ "$UNINSTALL" = "1" ]; then
  say "== CloudDeck uninstall =="
  if systemd_present; then
    systemctl disable --now clouddeck-panel >/dev/null 2>&1 || true
    systemctl disable --now clouddeck-agent >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/clouddeck-agent.service /etc/systemd/system/clouddeck-panel.service
    systemctl daemon-reload >/dev/null 2>&1 || true
  fi
  if [ -x "$PREFIX/run/stop.sh" ]; then "$PREFIX/run/stop.sh" >/dev/null 2>&1 || true; fi
  pkill -f "$PREFIX/clouddeck-agent" 2>/dev/null || true
  rm -rf "$PREFIX"
  if [ "$PURGE" = "1" ]; then
    rm -rf "$DATADIR" "$ETCDIR"
    say "removed binaries, data and config"
  else
    say "removed binaries; kept $DATADIR and $ETCDIR (use --purge to remove them too)"
  fi
  exit 0
fi

say "== CloudDeck installer =="
say "   arch: $MACHINE    systemd: $(systemd_present && say yes || say no)"
resolve_latest
say "   version: $VERSION"

TMP="$(mktemp -d /tmp/clouddeck-install.XXXXXX)" || die "mktemp failed"
trap 'rm -rf "$TMP"' EXIT INT TERM

mkdir -p "$PREFIX" "$DATADIR" "$ETCDIR"

# --- agent -------------------------------------------------------------------
if [ "$DO_AGENT" = "1" ]; then
  say "-- downloading agent"
  AGENT_FILE="clouddeck-agent-linux-$ARCH_GO"
  download_asset "$AGENT_FILE" "$TMP/$AGENT_FILE"
  install -m 0755 "$TMP/$AGENT_FILE" "$PREFIX/clouddeck-agent.new"
  mv -f "$PREFIX/clouddeck-agent.new" "$PREFIX/clouddeck-agent"
  say "   installed $PREFIX/clouddeck-agent"
fi

# --- node runtime ------------------------------------------------------------
if [ "$DO_PANEL" = "1" ] && [ ! -x "$PREFIX/node/bin/node" ]; then
  say "-- downloading Node.js $NODE_VERSION (pinned runtime, no distro packages)"
  NODE_TARBALL="node-v$NODE_VERSION-linux-$ARCH_NODE.tar.gz"
  download "https://nodejs.org/dist/v$NODE_VERSION/$NODE_TARBALL" "$TMP/$NODE_TARBALL"
  if command -v sha256sum >/dev/null 2>&1; then
    download "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" "$TMP/SHASUMS256.txt"
    ( cd "$TMP" && grep " $NODE_TARBALL\$" SHASUMS256.txt | sha256sum -c - >/dev/null 2>&1 ) \
      || die "Node.js checksum verification failed"
    say "   checksum ok"
  fi
  mkdir -p "$PREFIX/node"
  tar -xzf "$TMP/$NODE_TARBALL" -C "$PREFIX/node" --strip-components=1 \
    || die "failed to extract Node.js"
fi

# --- panel -------------------------------------------------------------------
if [ "$DO_PANEL" = "1" ]; then
  say "-- downloading panel"
  download_asset "clouddeck-panel.tar.gz" "$TMP/clouddeck-panel.tar.gz"
  mkdir -p "$PREFIX/panel"
  tar -xzf "$TMP/clouddeck-panel.tar.gz" -C "$PREFIX/panel" || die "failed to extract panel"
  say "   installed $PREFIX/panel"

  # unprivileged user for the panel
  PANEL_USER=""
  if command -v useradd >/dev/null 2>&1; then
    if ! id clouddeck >/dev/null 2>&1; then
      useradd -r -s /sbin/nologin -d "$DATADIR/panel" clouddeck 2>/dev/null || true
    fi
    if id clouddeck >/dev/null 2>&1; then PANEL_USER="clouddeck"; fi
  elif command -v adduser >/dev/null 2>&1; then
    if ! id clouddeck >/dev/null 2>&1; then
      adduser -S -H -h "$DATADIR/panel" clouddeck 2>/dev/null || true
    fi
    if id clouddeck >/dev/null 2>&1; then PANEL_USER="clouddeck"; fi
  fi
fi

mkdir -p "$DATADIR/agent" "$DATADIR/agent/backups" "$DATADIR/panel"
chmod 750 "$DATADIR"
if [ -n "${PANEL_USER:-}" ]; then chown -R "$PANEL_USER" "$DATADIR/panel" 2>/dev/null || true; fi

# --- configs -----------------------------------------------------------------
if [ "$DO_AGENT" = "1" ] && [ ! -f "$ETCDIR/agent.env" ]; then
  cat > "$ETCDIR/agent.env" <<EOF
# CloudDeck agent configuration
AGENT_LISTEN=127.0.0.1:$AGENT_PORT
AGENT_STATE_DIR=$DATADIR/agent
# Coexisting installs (e.g. aaPanel): point these at the real paths, e.g.
# AGENT_NGINX_SITES_DIR=/www/server/panel/vhost/nginx
# AGENT_LOG_DIR=/www/wwwlogs
# AGENT_PHP_FPM_SOCK=/tmp/php-cgi-{{version}}.sock
# AGENT_MYSQL_BIN=/www/server/mysql/bin/mysql
# AGENT_MYSQL_ROOT_PASSWORD=...
# AGENT_PDNSUTIL_BIN=/usr/bin/pdnsutil
# AGENT_PDNS_CONF_DIR=/etc/powerdns
# AGENT_RCLONE_BIN=rclone
AGENT_BACKUP_DIR=$DATADIR/agent/backups
# AGENT_TELEGRAM_BOT_TOKEN=...
# AGENT_TELEGRAM_CHAT_ID=...
EOF
  chmod 600 "$ETCDIR/agent.env"
  say "-- wrote $ETCDIR/agent.env"
fi

if [ "$DO_PANEL" = "1" ] && [ ! -f "$ETCDIR/panel.env" ]; then
  SECRET="$(random_hex 32)"
  cat > "$ETCDIR/panel.env" <<EOF
# CloudDeck panel configuration
PORT=$PANEL_PORT
HOSTNAME=0.0.0.0
NODE_ENV=production
AGENT_URL=http://127.0.0.1:$AGENT_PORT
PANEL_DATA_DIR=$DATADIR/panel
PANEL_SESSION_SECRET=$SECRET
# Optional unattended provisioning - uncomment both to create this admin
# account on first start and skip the web setup wizard:
# PANEL_SEED_ADMIN=admin
# PANEL_SEED_PASSWORD=change-me
# Set to true once the panel is served over HTTPS:
PANEL_COOKIE_SECURE=false
EOF
  chmod 600 "$ETCDIR/panel.env"
  say "-- wrote $ETCDIR/panel.env"
fi

# --- service management ------------------------------------------------------
WROTE_SYSTEMD=0
if systemd_present && { [ "$DO_AGENT" = "1" ] || [ "$DO_PANEL" = "1" ]; }; then
  if [ "$DO_AGENT" = "1" ]; then
    cat > /etc/systemd/system/clouddeck-agent.service <<EOF
[Unit]
Description=CloudDeck agent (privileged, localhost API)
After=network.target

[Service]
Type=simple
EnvironmentFile=$ETCDIR/agent.env
ExecStart=$PREFIX/clouddeck-agent
Restart=on-failure
RestartSec=2
User=root

[Install]
WantedBy=multi-user.target
EOF
  fi
  if [ "$DO_PANEL" = "1" ]; then
    cat > /etc/systemd/system/clouddeck-panel.service <<EOF
[Unit]
Description=CloudDeck panel (web UI + API)
After=network.target clouddeck-agent.service

[Service]
Type=simple
EnvironmentFile=$ETCDIR/panel.env
ExecStart=$PREFIX/node/bin/node server.js
WorkingDirectory=$PREFIX/panel
Restart=on-failure
RestartSec=2
${PANEL_USER:+User=$PANEL_USER}

[Install]
WantedBy=multi-user.target
EOF
  fi
  systemctl daemon-reload
  [ "$DO_AGENT" = "1" ] && systemctl enable --now clouddeck-agent >/dev/null 2>&1 || true
  [ "$DO_PANEL" = "1" ] && systemctl enable --now clouddeck-panel >/dev/null 2>&1 || true
  WROTE_SYSTEMD=1
  say "-- systemd services enabled: clouddeck-agent, clouddeck-panel"
fi

# fallback: start/stop scripts that work without systemd
mkdir -p "$PREFIX/run"
cat > "$PREFIX/run/start.sh" <<EOF
#!/bin/sh
# Start CloudDeck without systemd.
set -eu
if [ -f "$ETCDIR/agent.env" ]; then
  set -a; . "$ETCDIR/agent.env"; set +a
  ( cd "$PREFIX" && nohup "$PREFIX/clouddeck-agent" >> "$PREFIX/run/agent.log" 2>&1 < /dev/null & echo \$! > "$PREFIX/run/agent.pid" )
fi
if [ -f "$ETCDIR/panel.env" ]; then
  set -a; . "$ETCDIR/panel.env"; set +a
  ( cd "$PREFIX/panel" && nohup "$PREFIX/node/bin/node" server.js >> "$PREFIX/run/panel.log" 2>&1 < /dev/null & echo \$! > "$PREFIX/run/panel.pid" )
fi
echo "started"
EOF
cat > "$PREFIX/run/stop.sh" <<EOF
#!/bin/sh
# Stops the processes started by start.sh (pid files in the same directory).
# Next.js standalone forks a child that owns the listening socket, so
# children are signalled before the parent, and a KILL pass follows.
stop_one() {
  pidfile="\$1"
  [ -f "\$pidfile" ] || return 0
  pid="\$(cat "\$pidfile")"
  pkill -TERM -P "\$pid" 2>/dev/null || true
  kill -TERM "\$pid" 2>/dev/null || true
  kill -TERM -- "-\$pid" 2>/dev/null || true
  sleep 1
  pkill -KILL -P "\$pid" 2>/dev/null || true
  kill -9 "\$pid" 2>/dev/null || true
  kill -9 -- "-\$pid" 2>/dev/null || true
  rm -f "\$pidfile"
}
stop_one "$PREFIX/run/panel.pid"
stop_one "$PREFIX/run/agent.pid"
echo "stopped"
EOF
chmod +x "$PREFIX/run/start.sh" "$PREFIX/run/stop.sh"

if [ "$WROTE_SYSTEMD" = "0" ]; then
  say "-- no systemd: starting via $PREFIX/run/start.sh"
  "$PREFIX/run/start.sh"
fi

# --- verify ------------------------------------------------------------------
if [ "$DO_AGENT" = "1" ]; then
  say "-- waiting for the agent"
  i=0
  while [ $i -lt 20 ]; do
    if curl -fsS "http://127.0.0.1:$AGENT_PORT/v1/health" >/dev/null 2>&1; then break; fi
    i=$((i + 1)); sleep 1
  done
  if curl -fsS "http://127.0.0.1:$AGENT_PORT/v1/health" >/dev/null 2>&1; then
    say "   agent OK: $(curl -fsS "http://127.0.0.1:$AGENT_PORT/v1/health")"
  else
    warn "agent did not answer on 127.0.0.1:$AGENT_PORT - check logs"
  fi
fi

if [ "$DO_PANEL" = "1" ]; then
  say "-- waiting for the panel"
  i=0
  while [ $i -lt 30 ]; do
    if curl -fsSL --max-time 2 -o /dev/null "http://127.0.0.1:$PANEL_PORT/" 2>/dev/null; then break; fi
    i=$((i + 1)); sleep 1
  done
  if curl -fsSL --max-time 2 -o /dev/null "http://127.0.0.1:$PANEL_PORT/"; then
    say "   panel OK (localhost:$PANEL_PORT)"
  else
    warn "panel did not answer on port $PANEL_PORT - check logs"
  fi
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$IP" ] || IP="<server-ip>"

say ""
say "================ CloudDeck installed ================"
if [ "$DO_PANEL" = "1" ]; then
  say "  Panel:     http://$IP:$PANEL_PORT"
  say "  Setup:     open the panel URL to create your admin account"
fi
if [ "$DO_AGENT" = "1" ]; then
  say "  Agent API: http://127.0.0.1:$AGENT_PORT/v1/health (localhost only)"
fi
say "  Config:    $ETCDIR/agent.env, $ETCDIR/panel.env"
say "  Data:      $DATADIR"
if systemd_present; then
  say "  Manage:    systemctl {status,restart} clouddeck-agent clouddeck-panel"
else
  say "  Manage:    $PREFIX/run/start.sh | $PREFIX/run/stop.sh"
fi
say "====================================================="
say "Tip: for sites, install nginx + PHP-FPM (or point the agent at an existing stack via agent.env)."
