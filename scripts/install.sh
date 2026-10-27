#!/bin/sh
# CloudDeck installer - one command, any Linux distro.
#
#   curl -fsSL https://github.com/dakshraman/clouddeck/releases/latest/download/install.sh | sudo bash
#
# Installs the CloudDeck agent (static binary) and panel (Node standalone
# bundle + pinned Node runtime) plus, on Debian/Ubuntu, the host web stack the
# panel manages: nginx, PHP-FPM, MariaDB, certbot and Node.js/npm on PATH.
# Everything else is downloaded with curl and unpacked with tar. Uses systemd
# when available, otherwise writes start/stop scripts.
#
# Flags:
#   --version vX.Y.Z     release to install (default: latest)
#   --prefix DIR         install dir (default: /opt/clouddeck)
#   --datadir DIR        state dir (default: /var/lib/clouddeck)
#   --etcdir DIR         config dir (default: /etc/clouddeck)
#   --agent-port N       agent port (default: 9090, binds 127.0.0.1)
#   --panel-port N       panel port (default: 2083, binds 0.0.0.0)
#   --gh-token TOKEN     GitHub token for downloading from a private repo
#   --no-agent           skip the agent
#   --no-panel           skip the panel
#   --no-systemd         force script mode even if systemd is present
#   --force              re-download binaries even if the version matches
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
PANEL_PORT="2083"
GH_TOKEN="${CLOUDDECK_GH_TOKEN:-}"
DO_AGENT=1
DO_PANEL=1
FORCE_NO_SYSTEMD=0
FORCE=0
UNINSTALL=0
PURGE=0
STACK_PROVISIONED=0
DB_UNIT="mariadb"

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
    --force)       FORCE=1; shift ;;
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
  --panel-port N       panel port (default: 2083, binds 0.0.0.0)
  --gh-token TOKEN     GitHub token (private repos)
  --no-agent           skip the agent
  --no-panel           skip the panel
  --no-systemd         force script mode even if systemd is present
  --force              re-download binaries even if the version matches
  --uninstall          stop and remove binaries + units (keeps data)
  --purge              with --uninstall: remove data + config too
USAGE
      exit 0
      ;;
    *)             die "unknown flag: $1 (see --help)" ;;
  esac
done

[ "$(id -u)" = "0" ] || die "must run as root:  curl ... | sudo bash"

# Generated units/scripts do not quote these paths, so keep them shell-safe.
for _dir in "$PREFIX" "$DATADIR" "$ETCDIR"; do
  case "$_dir" in
    *[[:space:]]*) die "paths must not contain whitespace: $_dir" ;;
    "") die "paths must not be empty" ;;
  esac
done

# --- architecture ------------------------------------------------------------
MACHINE="$(uname -m)"
case "$MACHINE" in
  x86_64|amd64)  ARCH_GO="amd64"; ARCH_NODE="x64" ;;
  aarch64|arm64) ARCH_GO="arm64"; ARCH_NODE="arm64" ;;
  *) die "unsupported architecture: $MACHINE (needs x86_64 or aarch64)" ;;
esac

# --- download helpers --------------------------------------------------------
# Downloads are resumable: a dropped or stalled transfer keeps the bytes it
# already wrote, and the next attempt continues with a Range request instead of
# starting over. The stall threshold is deliberately forgiving (1 KiB/s for 5
# minutes) because release CDNs can be slow without being dead.
download_url() { # download_url URL OUTFILE [extra curl args...]
  _url="$1" _out="$2"; shift 2
  _tries=0
  while [ "$_tries" -lt 6 ]; do
    _tries=$((_tries + 1))
    _rc=0
    curl -fsSL --connect-timeout 15 --speed-limit 1024 --speed-time 300 \
      --max-time 7200 --continue-at - -o "$_out" "$@" "$_url" || _rc=$?
    [ "$_rc" = "0" ] && return 0
    # 33: the server refused the resume range (or the file is already whole).
    # Drop the partial file so the next attempt starts clean.
    [ "$_rc" = "33" ] && rm -f "$_out"
    [ "$_tries" -lt 6 ] && sleep $((_tries * 2))
  done
  return 1
}

download() { # download URL OUTFILE  (plain public download, e.g. nodejs.org)
  download_url "$1" "$2" || die "download failed: $1"
}

resolve_latest() { # sets VERSION to the latest tag
  [ "$VERSION" = "latest" ] || return 0
  if [ -n "$GH_TOKEN" ]; then
    VERSION="$(curl -fsSL --retry 5 --retry-delay 2 --connect-timeout 15 --max-time 120 \
        -H "Authorization: token $GH_TOKEN" \
        "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
        | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  else
    VERSION="$(curl -fsSL --retry 5 --retry-delay 2 --connect-timeout 15 --max-time 120 \
        "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
        | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  fi
  [ -n "$VERSION" ] || die "could not resolve the latest release (private repo without --gh-token?)"
}

release_json() { # fetch the release JSON for $VERSION
  if [ -n "$GH_TOKEN" ]; then
    curl -fsSL --retry 5 --retry-delay 2 --connect-timeout 15 --max-time 120 \
      -H "Authorization: token $GH_TOKEN" "https://api.github.com/repos/$REPO/releases/tags/$VERSION"
  else
    curl -fsSL --retry 5 --retry-delay 2 --connect-timeout 15 --max-time 120 \
      "https://api.github.com/repos/$REPO/releases/tags/$VERSION"
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
    download_url "https://api.github.com/repos/$REPO/releases/assets/$_id" "$2" \
      -H "Authorization: token $GH_TOKEN" -H "Accept: application/octet-stream" \
      || die "download failed: $_name"
  else
    download_url "https://github.com/$REPO/releases/download/$VERSION/$_name" "$2" \
      || die "download failed: $_name (private repo? pass --gh-token)"
  fi
}

systemd_present() {
  [ "$FORCE_NO_SYSTEMD" = "0" ] && [ -d /run/systemd/system ] && command -v systemctl >/dev/null 2>&1
}

# --- hosting stack -----------------------------------------------------------
# The panel manages nginx, PHP-FPM, MariaDB and certbot on the host, so install
# them here instead of leaving the web UI with dead pages. This runs on every
# install, including same-version reruns; apt-get is idempotent. Non-Debian
# hosts still get the panel/agent, but must install the stack themselves.
provision_packages() {
  if ! command -v apt-get >/dev/null 2>&1; then
    warn "apt-get not found: install nginx, PHP-FPM, MariaDB and certbot manually"
    return 0
  fi

  _pkgs="nginx php-fpm php-cli php-mysql php-curl php-gd php-mbstring php-xml
    php-zip php-intl php-bcmath php-opcache git unzip"

  # MariaDB and MySQL server packages conflict: keep whichever is already here.
  if command -v mysqld >/dev/null 2>&1 \
      || dpkg -s mysql-server >/dev/null 2>&1 \
      || dpkg -s mariadb-server >/dev/null 2>&1; then
    say "-- existing MySQL/MariaDB server detected; leaving it in place"
    if dpkg -s mysql-server >/dev/null 2>&1 && ! dpkg -s mariadb-server >/dev/null 2>&1; then
      DB_UNIT="mysql"
    fi
    command -v mysql >/dev/null 2>&1 \
      || warn "mysql client not found: install mysql-client or mariadb-client"
  else
    _pkgs="$_pkgs mariadb-server mariadb-client"
  fi

  # certbot is used with --webroot, so the nginx plugin is not required.
  if ! command -v certbot >/dev/null 2>&1 && ! dpkg -s certbot >/dev/null 2>&1; then
    _pkgs="$_pkgs certbot"
  fi

  # php-opcache is a virtual package on Ubuntu; the module comes from
  # php<ver>-opcache, so dpkg -s always misses it after a successful install.
  _wanted=""
  for _pkg in $_pkgs; do
    if [ "$_pkg" = "php-opcache" ] && php -m 2>/dev/null | grep -qx 'Zend OPcache'; then
      continue
    fi
    _wanted="$_wanted $_pkg"
  done
  _pkgs="$_wanted"

  _missing=""
  for _pkg in $_pkgs; do
    dpkg -s "$_pkg" >/dev/null 2>&1 || _missing="$_missing $_pkg"
  done

  if [ -z "$_missing" ]; then
    say "-- hosting packages already installed"
  else
    say "-- installing hosting packages (nginx, PHP-FPM, database, certbot)"
    DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
      apt-get update -qq -o DPkg::Lock::Timeout=300 \
      || warn "apt-get update failed; using the current package lists"
    # shellcheck disable=SC2086
    DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
      apt-get install -y -o DPkg::Lock::Timeout=300 \
        -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
        $_missing || die "failed to install hosting packages:$_missing"
    say "   installed:$_missing"
  fi

  mkdir -p /www/wwwroot
  STACK_PROVISIONED=1
}

start_hosting_services() {
  if systemd_present; then
    for _svc in nginx "$DB_UNIT"; do
      systemctl enable --now "$_svc" >/dev/null 2>&1 \
        || warn "could not start $_svc (another web server or database may own the port)"
    done
    for _unit in $(systemctl list-unit-files --type=service --no-legend 'php*-fpm.service' 2>/dev/null | awk '{print $1}'); do
      systemctl enable --now "$_unit" >/dev/null 2>&1 || warn "could not start $_unit"
    done
    systemctl enable --now certbot.timer >/dev/null 2>&1 || true
  else
    for _svc in nginx "$DB_UNIT"; do
      service "$_svc" start >/dev/null 2>&1 \
        || warn "could not start $_svc (another web server or database may own the port)"
    done
    for _init in /etc/init.d/php*-fpm; do
      [ -x "$_init" ] || continue
      "$_init" start >/dev/null 2>&1 || warn "could not start ${_init##*/}"
    done
  fi
}

random_hex() { # random_hex BYTES
  od -An -N "$1" -tx1 /dev/urandom | tr -d ' \n'
}

# --- uninstall ---------------------------------------------------------------
if [ "$UNINSTALL" = "1" ]; then
  say "== CloudDeck uninstall =="
  case "$PREFIX" in
    ""|"/"|"/usr"|"/var"|"/etc"|"/opt"|"/home"|"/root")
      die "refusing to remove $PREFIX: not a CloudDeck prefix" ;;
  esac
  if [ ! -f "$PREFIX/.clouddeck-install" ] && [ ! -x "$PREFIX/clouddeck-agent" ]; then
    die "no CloudDeck install found at $PREFIX; refusing to remove it"
  fi
  # validate every path before deleting anything
  if [ "$PURGE" = "1" ]; then
    for _dir in "$DATADIR" "$ETCDIR"; do
      case "$_dir" in
        ""|"/"|"/usr"|"/var"|"/etc"|"/opt"|"/home"|"/root")
          die "refusing to purge $_dir" ;;
      esac
    done
    if [ ! -f "$ETCDIR/panel.env" ] && [ ! -f "$ETCDIR/agent.env" ]; then
      die "refusing to purge $ETCDIR: no CloudDeck config found there"
    fi
    if [ ! -d "$DATADIR/panel" ] && [ ! -d "$DATADIR/agent" ]; then
      die "refusing to purge $DATADIR: no CloudDeck data found there"
    fi
  fi
  # --no-systemd must not leave enabled units behind
  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    systemctl disable --now clouddeck-panel >/dev/null 2>&1 || true
    systemctl disable --now clouddeck-agent >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/clouddeck-agent.service /etc/systemd/system/clouddeck-panel.service
    systemctl daemon-reload >/dev/null 2>&1 || true
  fi
  if [ -x "$PREFIX/run/stop.sh" ]; then "$PREFIX/run/stop.sh" >/dev/null 2>&1 || true; fi
  pkill -f "$PREFIX/clouddeck-agent" 2>/dev/null || true
  # remove only the links this installer created, never a user's own node/npm
  for _bin in clouddeck node npm npx; do
    if [ -L "/usr/local/bin/$_bin" ]; then
      case "$(readlink "/usr/local/bin/$_bin")" in
        "$PREFIX"/*) rm -f "/usr/local/bin/$_bin" ;;
      esac
    fi
  done
  rm -rf "$PREFIX"
  if [ "$PURGE" = "1" ]; then
    rm -rf "$DATADIR" "$ETCDIR"
    say "removed binaries, data and config"
  else
    say "removed binaries; kept $DATADIR and $ETCDIR (use --purge to remove them too)"
  fi
  exit 0
fi

command -v curl >/dev/null 2>&1 || die "curl is required to install"
command -v tar  >/dev/null 2>&1 || die "tar is required to install"

say "== CloudDeck installer =="
say "   arch: $MACHINE    systemd: $(systemd_present && say yes || say no)"
resolve_latest
say "   version: $VERSION"

TMP="$(mktemp -d /tmp/clouddeck-install.XXXXXX)" || die "mktemp failed"
trap 'rm -rf "$TMP"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$PREFIX" "$DATADIR" "$ETCDIR"

provision_packages
if [ "$STACK_PROVISIONED" = "1" ]; then
  start_hosting_services
fi

# A repeat run with the same version refreshes config/services but does not
# re-download the binaries. The marker is written only after a verified install.
INSTALLED_VERSION=""
if [ -f "$PREFIX/.clouddeck-version" ]; then
  INSTALLED_VERSION="$(cat "$PREFIX/.clouddeck-version" 2>/dev/null || true)"
fi

# --- agent -------------------------------------------------------------------
if [ "$DO_AGENT" = "1" ]; then
  if [ "$INSTALLED_VERSION" = "$VERSION" ] && [ "$FORCE" = "0" ] && [ -x "$PREFIX/clouddeck-agent" ]; then
    say "-- agent $VERSION already installed"
  else
    say "-- downloading agent"
    AGENT_FILE="clouddeck-agent-linux-$ARCH_GO"
    download_asset "$AGENT_FILE" "$TMP/$AGENT_FILE"
    install -m 0755 "$TMP/$AGENT_FILE" "$PREFIX/clouddeck-agent.new"
    mv -f "$PREFIX/clouddeck-agent.new" "$PREFIX/clouddeck-agent"
    say "   installed $PREFIX/clouddeck-agent"
  fi
fi

# --- node runtime ------------------------------------------------------------
NODE_MARKER="$PREFIX/.clouddeck-node-version"
NODE_CURRENT="$(cat "$NODE_MARKER" 2>/dev/null || true)"
if [ "$DO_PANEL" = "1" ] && { [ ! -x "$PREFIX/node/bin/node" ] || [ "$NODE_CURRENT" != "$NODE_VERSION" ] || [ "$FORCE" = "1" ]; }; then
  say "-- downloading Node.js $NODE_VERSION (pinned runtime, no distro packages)"
  NODE_TARBALL="node-v$NODE_VERSION-linux-$ARCH_NODE.tar.gz"
  download "https://nodejs.org/dist/v$NODE_VERSION/$NODE_TARBALL" "$TMP/$NODE_TARBALL"
  if command -v sha256sum >/dev/null 2>&1; then
    download "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" "$TMP/SHASUMS256.txt"
    ( cd "$TMP" && grep " $NODE_TARBALL\$" SHASUMS256.txt | sha256sum -c - >/dev/null 2>&1 ) \
      || die "Node.js checksum verification failed"
    say "   checksum ok"
  fi
  mkdir -p "$TMP/node"
  tar -xzf "$TMP/$NODE_TARBALL" -C "$TMP/node" --strip-components=1 \
    || die "failed to extract Node.js"
  rm -rf "$PREFIX/node"
  mv "$TMP/node" "$PREFIX/node"
  printf '%s\n' "$NODE_VERSION" > "$NODE_MARKER"
fi
if [ "$DO_PANEL" = "1" ] && [ -d "$PREFIX/node" ]; then
  # tarballs carry the upstream build UID; /opt must stay root-owned
  chown -R 0:0 "$PREFIX/node"

  # expose the pinned runtime so hosted Node apps and npm work out of the box
  _linked=""
  for _bin in node npm npx; do
    _link="/usr/local/bin/$_bin"
    # replace a dangling link left by an older prefix
    if [ -L "$_link" ] && [ ! -e "$_link" ]; then rm -f "$_link"; fi
    if [ -x "$PREFIX/node/bin/$_bin" ] && [ ! -e "$_link" ] && [ ! -L "$_link" ]; then
      ln -s "$PREFIX/node/bin/$_bin" "$_link"
      _linked="$_linked $_bin"
    fi
  done
  if [ -n "$_linked" ]; then say "-- node/npm on PATH:$_linked"; fi

  if [ "$INSTALLED_VERSION" = "$VERSION" ] && [ "$FORCE" = "0" ] && [ -x "$PREFIX/bin/clouddeck" ]; then
    say "-- management CLI already installed"
  else
    say "-- installing management CLI"
    download_asset "clouddeck-cli" "$TMP/clouddeck-cli"
    mkdir -p "$PREFIX/bin"
    { printf '#!%s\n' "$PREFIX/node/bin/node"; tail -n +2 "$TMP/clouddeck-cli"; } > "$TMP/clouddeck-cli.inst"
    install -m 0755 "$TMP/clouddeck-cli.inst" "$PREFIX/bin/clouddeck"
  fi
  # repair the PATH link even when the CLI itself was already up to date
  if [ -x "$PREFIX/bin/clouddeck" ]; then
    ln -sf "$PREFIX/bin/clouddeck" /usr/local/bin/clouddeck
  fi
fi

# --- panel -------------------------------------------------------------------
if [ "$DO_PANEL" = "1" ]; then
  if [ "$INSTALLED_VERSION" = "$VERSION" ] && [ "$FORCE" = "0" ] && [ -f "$PREFIX/panel/server.js" ]; then
    say "-- panel $VERSION already installed"
  else
    say "-- downloading panel"
    download_asset "clouddeck-panel.tar.gz" "$TMP/clouddeck-panel.tar.gz"
    mkdir -p "$PREFIX/panel"
    tar -xzf "$TMP/clouddeck-panel.tar.gz" -C "$PREFIX/panel" || die "failed to extract panel"
    # the archive records the CI build UID; the panel must be root-owned and only
    # readable by the unprivileged service user
    chown -R 0:0 "$PREFIX/panel"
    chmod -R a+rX "$PREFIX/panel"
    say "   installed $PREFIX/panel"
  fi

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
if [ -n "${PANEL_USER:-}" ]; then
  chown -R "$PANEL_USER" "$DATADIR/panel" 2>/dev/null || true
  # The datadir itself is 750 root:root — give the panel user's group read/traverse
  # so the service can reach its own data (users.json, sessions) when not running as root.
  GRP="$(id -gn "$PANEL_USER" 2>/dev/null || echo "$PANEL_USER")"
  chgrp "$GRP" "$DATADIR" 2>/dev/null || true
fi

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
# App hosting supervisor: systemd (default), pm2 or supervisor.
# AGENT_APP_SUPERVISOR=systemd
# AGENT_APP_SUPERVISOR_DIR=/etc/supervisor/conf.d
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

# The env files are the source of truth on a rerun: a port passed on the
# command line only applies when the file is first created. Use the effective
# ports for the marker and the health checks so they cannot disagree.
EFFECTIVE_AGENT_PORT="$AGENT_PORT"
EFFECTIVE_PANEL_PORT="$PANEL_PORT"
if [ -f "$ETCDIR/agent.env" ]; then
  _p="$(sed -n 's/^AGENT_LISTEN=.*:\([0-9][0-9]*\)$/\1/p' "$ETCDIR/agent.env" | tail -n 1)"
  [ -n "$_p" ] && EFFECTIVE_AGENT_PORT="$_p"
fi
if [ -f "$ETCDIR/panel.env" ]; then
  _p="$(sed -n 's/^PORT=\([0-9][0-9]*\)$/\1/p' "$ETCDIR/panel.env" | tail -n 1)"
  [ -n "$_p" ] && EFFECTIVE_PANEL_PORT="$_p"
fi

# Layout for the management CLI (no secrets).
cat > "$PREFIX/.clouddeck-install" <<EOF
PREFIX=$PREFIX
DATADIR=$DATADIR
ETCDIR=$ETCDIR
AGENT_PORT=$EFFECTIVE_AGENT_PORT
PANEL_PORT=$EFFECTIVE_PANEL_PORT
REPO=$REPO
NO_SYSTEMD=$FORCE_NO_SYSTEMD
DO_AGENT=$DO_AGENT
DO_PANEL=$DO_PANEL
EOF
chmod 0644 "$PREFIX/.clouddeck-install"

# --- service management ------------------------------------------------------
# Switching modes must not leave the other supervisor running: systemd would
# fail to bind while the old script-mode process kept answering health checks.
if ! systemd_present && command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  systemctl disable --now clouddeck-panel >/dev/null 2>&1 || true
  systemctl disable --now clouddeck-agent >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/clouddeck-agent.service /etc/systemd/system/clouddeck-panel.service
  systemctl daemon-reload >/dev/null 2>&1 || true
fi

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
  # If this host previously ran in script mode, stop those processes first;
  # otherwise they keep the ports and systemd's fresh copies fail to bind.
  if [ -x "$PREFIX/run/stop.sh" ]; then "$PREFIX/run/stop.sh" >/dev/null 2>&1 || true; fi
  # enable for boot, then restart: `enable --now` is a no-op for services that
  # are already running, which would leave the old processes serving after an
  # upgrade (new binaries on disk, old version still answering).
  if [ "$DO_AGENT" = "1" ]; then
    systemctl enable clouddeck-agent >/dev/null 2>&1 || true
    systemctl restart clouddeck-agent >/dev/null 2>&1 || true
  fi
  if [ "$DO_PANEL" = "1" ]; then
    systemctl enable clouddeck-panel >/dev/null 2>&1 || true
    systemctl restart clouddeck-panel >/dev/null 2>&1 || true
  fi
  WROTE_SYSTEMD=1
  say "-- systemd services enabled: clouddeck-agent, clouddeck-panel"
fi

# fallback: start/stop scripts that work without systemd
PANEL_USER="${PANEL_USER:-}"
if [ -n "$PANEL_USER" ]; then
  # drop privileges for the panel even without systemd
  PANEL_LAUNCH="su -s /bin/sh $PANEL_USER -c 'exec $PREFIX/node/bin/node server.js'"
else
  PANEL_LAUNCH="$PREFIX/node/bin/node server.js"
fi
mkdir -p "$PREFIX/run"
cat > "$PREFIX/run/start.sh" <<EOF
#!/bin/sh
# Start CloudDeck without systemd. Each service gets its own session (setsid)
# so it survives the shell that ran the installer; the pid file is written by
# the new session leader, which is also the process group to stop.
set -eu
PANEL_USER="$PANEL_USER"
SETSID=""
command -v setsid >/dev/null 2>&1 && SETSID=setsid

# re-running the installer should restart, not duplicate, the services
"$PREFIX/run/stop.sh" >/dev/null 2>&1 || true

if [ -f "$ETCDIR/agent.env" ]; then
  set -a; . "$ETCDIR/agent.env"; set +a
  ( cd "$PREFIX" && \$SETSID sh -c 'echo \$\$ > "\$0"; exec "\$@"' "$PREFIX/run/agent.pid" "$PREFIX/clouddeck-agent" >> "$PREFIX/run/agent.log" 2>&1 < /dev/null & )
fi
if [ -f "$ETCDIR/panel.env" ]; then
  set -a; . "$ETCDIR/panel.env"; set +a
  ( cd "$PREFIX/panel" && \$SETSID sh -c 'echo \$\$ > "\$0"; exec "\$@"' "$PREFIX/run/panel.pid" $PANEL_LAUNCH >> "$PREFIX/run/panel.log" 2>&1 < /dev/null & )
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
    if curl -fsS "http://127.0.0.1:$EFFECTIVE_AGENT_PORT/v1/health" >/dev/null 2>&1; then break; fi
    i=$((i + 1)); sleep 1
  done
  if curl -fsS "http://127.0.0.1:$EFFECTIVE_AGENT_PORT/v1/health" >/dev/null 2>&1; then
    say "   agent OK: $(curl -fsS "http://127.0.0.1:$EFFECTIVE_AGENT_PORT/v1/health")"
  else
    die "agent did not answer on 127.0.0.1:$EFFECTIVE_AGENT_PORT - check: journalctl -u clouddeck-agent (or $PREFIX/run/agent.log)"
  fi
fi

if [ "$DO_PANEL" = "1" ]; then
  say "-- waiting for the panel"
  i=0
  while [ $i -lt 30 ]; do
    if curl -fsSL --max-time 2 -o /dev/null "http://127.0.0.1:$EFFECTIVE_PANEL_PORT/" 2>/dev/null; then break; fi
    i=$((i + 1)); sleep 1
  done
  if curl -fsSL --max-time 2 -o /dev/null "http://127.0.0.1:$EFFECTIVE_PANEL_PORT/"; then
    say "   panel OK (localhost:$EFFECTIVE_PANEL_PORT)"
  else
    die "panel did not answer on port $EFFECTIVE_PANEL_PORT - check: journalctl -u clouddeck-panel (or $PREFIX/run/panel.log)"
  fi
fi

# remember the verified version so a repeat run can skip the downloads
if [ "$DO_AGENT" = "1" ] || [ "$DO_PANEL" = "1" ]; then
  printf '%s\n' "$VERSION" > "$PREFIX/.clouddeck-version"
fi

# WSL exposes services to Windows on localhost, not on the distro's eth0 IP.
if [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qi microsoft /proc/version 2>/dev/null; then
  PANEL_URL="http://localhost:$EFFECTIVE_PANEL_PORT"
else
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$IP" ] || IP="<server-ip>"
  PANEL_URL="http://$IP:$EFFECTIVE_PANEL_PORT"
fi

say ""
say "================ CloudDeck installed ================"
if [ "$DO_PANEL" = "1" ]; then
  say "  Panel:     $PANEL_URL"
  say "  Setup:     open the panel URL to create your admin account"
fi
if [ "$DO_AGENT" = "1" ]; then
  say "  Agent API: http://127.0.0.1:$EFFECTIVE_AGENT_PORT/v1/health (localhost only)"
fi
say "  Config:    $ETCDIR/agent.env, $ETCDIR/panel.env"
say "  Data:      $DATADIR"
if [ "$STACK_PROVISIONED" = "1" ]; then
  say "  Stack:     nginx, PHP-FPM, MariaDB, certbot, Node.js/npm"
fi
if [ "$DO_PANEL" = "1" ]; then
  say "  Manage:    clouddeck {status,restart,logs,update,uninstall}"
  say "  Password:  sudo clouddeck user passwd   (after setup)"
elif systemd_present; then
  say "  Manage:    systemctl {status,restart} clouddeck-agent clouddeck-panel"
else
  say "  Manage:    $PREFIX/run/start.sh | $PREFIX/run/stop.sh"
fi
say "====================================================="
if [ "$STACK_PROVISIONED" = "1" ]; then
  say "Hosting stack ready: nginx on port 80, PHP-FPM and MariaDB are enabled."
else
  say "Tip: for sites, install nginx + PHP-FPM (or point the agent at an existing stack via agent.env)."
fi
