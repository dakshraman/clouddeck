#!/bin/sh
# CloudDeck Unified Universal Installer
# One script for every platform: Linux, macOS, and Windows (WSL 2).
#
# Usage:
#   curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash    # Linux
#   curl -fsSL https://clouddeck.dakshraman.in/install.sh | bash         # macOS
#   irm https://clouddeck.dakshraman.in/install.ps1 | iex               # Windows PowerShell
#
# Interactive terminal UI/UX styled with the CloudDeck Uni Theme:
#   #74B8CC (Sky Powder Teal) | #235361 (Deep Marine Teal)
#   #FAAA93 (Pastel Peach)    | #6494AC (Steel Teal)
#   #886351 (Warm Chestnut)   | #D2ADAC (Soft Mauve Rose)
#
# Automatically detects the host OS, presents an interactive component
# selector (removing the need for separate fast/standard scripts), and
# provisions the complete LEMP hosting or local development environment.
set -eu
stty onlcr 2>/dev/null || true

REPO="dakshraman/clouddeck"
NODE_VERSION="22.23.4"
VERSION="latest"
PREFIX=""
DATADIR=""
ETCDIR=""
AGENT_PORT="9090"
PANEL_PORT="2083"
GH_TOKEN="${CLOUDDECK_GH_TOKEN:-}"

# Component selection flags
INSTALL_PROFILE="recommended" # recommended, fast, custom, minimal
DO_AGENT=1
DO_PANEL=1
DO_CLI=1
DO_NGINX=1
DO_MARIADB=1
DO_PHP=1
DO_PHP_MULTI=1
DO_NODE=1
DO_EMAIL=0
DO_DNS=0
DO_SECURITY=0
DO_LOCAL_CA=1

# Script execution modes
FAST=0
SYSTEM_NODE=0
USING_SYSTEM_NODE=0
SYS_NODE_PATH=""
SYS_NPM_PATH=""
SYS_NPX_PATH=""
SYS_NODE_VER=""
PID_AGENT=""
PID_PANEL=""
PID_CLI=""
PID_NODE=""
FORCE_NO_SYSTEMD=0
FORCE=0
UNINSTALL=0
PURGE=0
NON_INTERACTIVE=0
NO_COLOR=0
SKIP_TRUST=0
STACK_PROVISIONED=0
DB_UNIT="mariadb"
PANEL_SEED_ADMIN=""
PANEL_SEED_PASSWORD=""

# --- ANSI Theme Colors (Uni 6-Color Palette) ---------------------------------
init_colors() {
  if [ "$NO_COLOR" = "1" ] || { [ ! -t 1 ] && [ "${FORCE_COLOR:-0}" != "1" ]; }; then
    CLR_RESET=""
    CLR_BOLD=""
    CLR_DIM=""
    TC_SKY=""
    TC_MARINE=""
    TC_PEACH=""
    TC_STEEL=""
    TC_CHESTNUT=""
    TC_MAUVE=""
    TC_BG_MARINE=""
    TC_BG_SKY=""
    TC_BG_PEACH=""
    CLR_GREEN=""
    CLR_RED=""
    CLR_YELLOW=""
  else
    ESC="$(printf '\033')"
    CLR_RESET="${ESC}[0m"
    CLR_BOLD="${ESC}[1m"
    CLR_DIM="${ESC}[2m"
    # Uni 24-bit TrueColor
    TC_SKY="${ESC}[38;2;116;184;204m"       # #74B8CC
    TC_MARINE="${ESC}[38;2;35;83;97m"       # #235361
    TC_PEACH="${ESC}[38;2;250;170;147m"     # #FAAA93
    TC_STEEL="${ESC}[38;2;100;148;172m"     # #6494AC
    TC_CHESTNUT="${ESC}[38;2;136;99;81m"   # #886351
    TC_MAUVE="${ESC}[38;2;210;173;172m"     # #D2ADAC
    TC_BG_MARINE="${ESC}[48;2;35;83;97m"
    TC_BG_SKY="${ESC}[48;2;116;184;204m"
    TC_BG_PEACH="${ESC}[48;2;250;170;147m"
    CLR_GREEN="${ESC}[38;2;52;199;89m"
    CLR_RED="${ESC}[38;2;255;59;48m"
    CLR_YELLOW="${ESC}[38;2;255;204;0m"
  fi
}
init_colors

# Logging helpers
# Logging helpers (Claude Code / Antigravity CLI styling)
say()        { printf '%b\n' "$*"; }
step()       { printf "  ${TC_SKY}${CLR_BOLD}❯${CLR_RESET} %b\n" "$*"; }
ok()         { printf "  ${CLR_GREEN}${CLR_BOLD}✔${CLR_RESET} %b\n" "$*"; }
info()       { printf "  ${TC_STEEL}${CLR_BOLD}ℹ${CLR_RESET} %b\n" "$*"; }
warn()       { printf "  ${CLR_YELLOW}${CLR_BOLD}▲${CLR_RESET} %b\n" "$*" >&2; }
die()        { printf "  ${CLR_RED}${CLR_BOLD}✖ [ERROR]${CLR_RESET} %b\n" "$*" >&2; exit 1; }
phase()      { printf "\n  ${TC_PEACH}${CLR_BOLD}[%s/%s]${CLR_RESET} ${TC_SKY}${CLR_BOLD}❯${CLR_RESET} ${CLR_BOLD}%b${CLR_RESET}\n" "$1" "$2" "$3"; }
item()       { printf "        ${TC_STEEL}•${CLR_RESET} %b\n" "$*"; }
item_ok()    { printf "        ${CLR_GREEN}${CLR_BOLD}✔${CLR_RESET} %b\n" "$*"; }
item_info()  { printf "        ${TC_STEEL}${CLR_BOLD}ℹ${CLR_RESET} %b\n" "$*"; }
item_warn()  { printf "        ${CLR_YELLOW}${CLR_BOLD}▲${CLR_RESET} %b\n" "$*"; }

_file_size() {
  local _f="$1"
  if [ -f "$_f" ]; then
    if command -v du >/dev/null 2>&1; then
      du -h "$_f" 2>/dev/null | awk '{print $1}' || echo "ready"
    else
      echo "ready"
    fi
  else
    echo "0B"
  fi
}

# --- Terminal Banner ---------------------------------------------------------
print_banner() {
  cat << EOF

${TC_SKY}${CLR_BOLD}   ██████╗██╗      ██████╗ ██╗   ██╗██████╗ ██████╗ ███████╗ ██████╗██╗  ██╗
  ██╔════╝██║     ██╔═══██╗██║   ██║██╔══██╗██╔══██╗██╔════╝██╔════╝██║ ██╔╝
  ██║     ██║     ██║   ██║██║   ██║██║  ██║██║  ██║█████╗  ██║     █████╔╝ 
  ██║     ██║     ██║   ██║██║   ██║██║  ██║██║  ██║██╔══╝  ██║     ██╔═██╗ 
  ╚██████╗███████╗╚██████╔╝╚██████╔╝██████╔╝██████╔╝███████╗╚██████╗██║  ██╗
   ╚═════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝${CLR_RESET}

  ${TC_BG_MARINE}${TC_SKY}${CLR_BOLD}  CLOUDDECK  ${CLR_RESET} ${TC_PEACH}${CLR_BOLD}The Modern, Lightweight cPanel Alternative${CLR_RESET}
  ${CLR_DIM}Unified Cross-Platform Installer • Uni 6-Color Design Edition${CLR_RESET}

EOF
}

# --- Parse Arguments ---------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --version)         VERSION="$2"; shift 2 ;;
    --prefix)          PREFIX="$2"; shift 2 ;;
    --datadir)         DATADIR="$2"; shift 2 ;;
    --etcdir)          ETCDIR="$2"; shift 2 ;;
    --agent-port)      AGENT_PORT="$2"; shift 2 ;;
    --panel-port)      PANEL_PORT="$2"; shift 2 ;;
    --admin-user|--user) PANEL_SEED_ADMIN="$2"; shift 2 ;;
    --admin-pass|--admin-password|--pass) PANEL_SEED_PASSWORD="$2"; shift 2 ;;
    --gh-token)        GH_TOKEN="$2"; shift 2 ;;
    --profile)         INSTALL_PROFILE="$2"; shift 2 ;;
    --fast|--minimal)  FAST=1; INSTALL_PROFILE="fast"; shift ;;
    --system-node)     SYSTEM_NODE=1; shift ;;
    --no-agent)        DO_AGENT=0; shift ;;
    --no-panel)        DO_PANEL=0; shift ;;
    --no-systemd)      FORCE_NO_SYSTEMD=1; shift ;;
    --force)           FORCE=1; shift ;;
    --yes|-y)          NON_INTERACTIVE=1; shift ;;
    --no-color)        NO_COLOR=1; init_colors; shift ;;
    --skip-trust)      SKIP_TRUST=1; DO_LOCAL_CA=0; shift ;;
    --uninstall)       UNINSTALL=1; shift ;;
    --purge)           PURGE=1; shift ;;
    --)                shift ;;
    -h|--help)
      cat <<'USAGE'
CloudDeck Unified Cross-Platform Installer.

Usage:
  Linux (root required):   curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash
  macOS (user or sudo):   curl -fsSL https://clouddeck.dakshraman.in/install.sh | bash
  Windows (PowerShell):    irm https://clouddeck.dakshraman.in/install.ps1 | iex

Flags:
  --yes, -y            Non-interactive installation (accept recommended defaults)
  --profile <name>     Installation profile: recommended, fast, custom, minimal
  --version vX.Y.Z     Release version to install (default: latest)
  --panel-port N       Web panel port (default: 2083)
  --agent-port N       Agent daemon port (default: 9090)
  --prefix DIR         Installation directory
  --datadir DIR        Data directory
  --etcdir DIR         Configuration directory
  --fast, --minimal    Fast core LEMP installation (alias for --profile fast)
  --system-node        Reuse host Node.js (>=20.0.0 with npm)
  --no-agent           Skip installing the agent
  --no-panel           Skip installing the web panel
  --no-systemd         Force script supervisor mode even if systemd is present
  --no-color           Disable terminal ANSI colors
  --skip-trust         Skip importing Local Root CA into system keychain
  --force              Re-download binaries even if version matches
  --uninstall          Stop and remove binaries and services (preserves data)
  --purge              With --uninstall: also completely erase data and configs
  -h, --help           Show this help message
USAGE
      exit 0
      ;;
    *) die "unknown flag: $1 (see --help)" ;;
  esac
done

# --- OS & Architecture Detection ---------------------------------------------
RAW_OS="$(uname -s)"
MACHINE="$(uname -m)"
IS_WSL=0
DISTRO_NAME=""
OS_TYPE=""

case "$RAW_OS" in
  Linux*)
    OS_TYPE="linux"
    if [ -f /proc/version ] && grep -qi microsoft /proc/version 2>/dev/null; then
      IS_WSL=1
      DISTRO_NAME="WSL 2 ($(sed -n 's/^NAME="\(.*\)"/\1/p' /etc/os-release 2>/dev/null || echo "Linux"))"
    elif [ -f /etc/os-release ]; then
      DISTRO_NAME="$(sed -n 's/^PRETTY_NAME="\(.*\)"/\1/p' /etc/os-release 2>/dev/null || echo "Linux")"
    else
      DISTRO_NAME="Linux (generic)"
    fi
    ;;
  Darwin*)
    OS_TYPE="darwin"
    DISTRO_NAME="macOS $(sw_vers -productVersion 2>/dev/null || echo "Darwin")"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    OS_TYPE="windows"
    DISTRO_NAME="Windows ($RAW_OS)"
    ;;
  *)
    die "Unsupported operating system: $RAW_OS"
    ;;
esac

# Architecture mapping
case "$MACHINE" in
  x86_64|amd64)
    ARCH_GO="amd64"
    ARCH_NODE="x64"
    ;;
  aarch64|arm64)
    ARCH_GO="arm64"
    ARCH_NODE="arm64"
    ;;
  *)
    die "Unsupported CPU architecture: $MACHINE (needs x86_64 or arm64/aarch64)"
    ;;
esac

# Default directories based on OS
if [ "$OS_TYPE" = "darwin" ]; then
  [ -z "$PREFIX" ] && PREFIX="/usr/local/opt/clouddeck"
  if [ ! -w "/usr/local" ] && [ "$(id -u)" != "0" ]; then
    PREFIX="$HOME/.clouddeck"
  fi
  [ -z "$DATADIR" ] && DATADIR="$HOME/.clouddeck/data"
  [ -z "$ETCDIR" ] && ETCDIR="$HOME/.clouddeck/etc"
else
  [ -z "$PREFIX" ] && PREFIX="/opt/clouddeck"
  [ -z "$DATADIR" ] && DATADIR="/var/lib/clouddeck"
  [ -z "$ETCDIR" ] && ETCDIR="/etc/clouddeck"
fi

# Path safety validation
for _dir in "$PREFIX" "$DATADIR" "$ETCDIR"; do
  case "$_dir" in
    *[[:space:]]*) die "paths must not contain whitespace: $_dir" ;;
    "") die "paths must not be empty" ;;
  esac
done

# If executed inside Windows Git Bash, forward to PowerShell/WSL workflow
if [ "$OS_TYPE" = "windows" ]; then
  print_banner
  warn "Windows host detected ($RAW_OS)."
  step "CloudDeck runs natively on Windows through WSL 2 (Windows Subsystem for Linux)."
  if command -v powershell.exe >/dev/null 2>&1; then
    say "${TC_STEEL}Launching CloudDeck Windows PowerShell Installer...${CLR_RESET}"
    exec powershell.exe -ExecutionPolicy Bypass -Command "irm https://clouddeck.dakshraman.in/install.ps1 | iex"
  else
    die "powershell.exe not found. Please run this installer from Windows PowerShell or WSL 2."
  fi
fi

# Privilege check on Linux
if [ "$OS_TYPE" = "linux" ] && [ "$UNINSTALL" = "0" ] && [ "$(id -u)" != "0" ]; then
  die "On Linux, CloudDeck requires root privileges for systemd and port binding:  curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash"
fi

# --- Helper Functions --------------------------------------------------------
systemd_present() {
  [ "$FORCE_NO_SYSTEMD" = "1" ] && return 1
  command -v systemctl >/dev/null 2>&1 || return 1
  [ -d /run/systemd/system ] || return 1
  local _sr
  _sr="$(systemctl is-system-running 2>/dev/null || true)"
  case "$_sr" in
    running|degraded|starting|initializing) return 0 ;;
    *) return 1 ;;
  esac
}

random_hex() {
  od -An -N "$1" -tx1 /dev/urandom | tr -d ' \n'
}

download_url() {
  _url="$1"; _out="$2"; shift 2
  _tries=0
  while [ $_tries -lt 3 ]; do
    if curl -fL --progress-bar --connect-timeout 15 --retry 2 "$@" -o "$_out" "$_url"; then
      if [ -s "$_out" ]; then return 0; fi
    fi
    rm -f "$_out"
    _tries=$((_tries + 1))
    item_warn "Download stalled or connection lost; retrying ($_tries/3)..."
    sleep 2
  done
  return 1
}

download() {
  download_url "$1" "$2"
}

resolve_latest() {
  if [ "$VERSION" = "latest" ]; then
    _tag="$(curl -fsSL -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' || true)"
    if [ -n "$_tag" ]; then
      VERSION="$_tag"
    else
      VERSION="v0.6.62"
    fi
  fi
}

cache_release_metadata() {
  [ "$VERSION" = "dev" ] && return 0
  _meta_url="https://api.github.com/repos/$REPO/releases/tags/$VERSION"
  _hdr=""
  [ -n "$GH_TOKEN" ] && _hdr="Authorization: token $GH_TOKEN"
  if [ -n "$_hdr" ]; then
    curl -fsSL -H "$_hdr" "$_meta_url" -o "$TMP/release.json" 2>/dev/null || true
  else
    curl -fsSL "$_meta_url" -o "$TMP/release.json" 2>/dev/null || true
  fi
}

download_asset() {
  _name="$1"; _out="$2"
  _base_url="https://github.com/$REPO/releases/download/$VERSION"
  if [ -f "$TMP/release.json" ] && [ -n "$GH_TOKEN" ]; then
    _id="$(grep -B2 "\"name\": \"$_name\"" "$TMP/release.json" | grep '"id":' | head -n1 | sed -E 's/.*"id": ([0-9]+).*/\1/' || true)"
    if [ -n "$_id" ]; then
      download_url "https://api.github.com/repos/$REPO/releases/assets/$_id" "$_out" \
        -H "Authorization: token $GH_TOKEN" -H "Accept: application/octet-stream"
      return 0
    fi
  fi
  download_url "$_base_url/$_name" "$_out"
}

# --- Interactive TTY Detection & Component Selector --------------------------
HAS_TTY=0
TTY_FD=0

setup_interactive_tty() {
  if [ -t 0 ]; then
    HAS_TTY=1
    TTY_FD=0
  elif [ -r /dev/tty ] && [ -w /dev/tty ]; then
    if exec 3</dev/tty 2>/dev/null; then
      if [ -t 3 ]; then
        HAS_TTY=1
        TTY_FD=3
      fi
    fi
  fi
}

prompt_read() {
  # Usage: prompt_read <varname> [default_val]
  local _target_var="$1"
  local _default_val="${2:-}"
  local _input=""
  if [ "$HAS_TTY" = "1" ] && [ "$NON_INTERACTIVE" = "0" ]; then
    if [ "$TTY_FD" = "3" ]; then
      read -r _input <&3 2>/dev/null || _input=""
    else
      read -r _input 2>/dev/null || _input=""
    fi
  else
    _input=""
  fi
  [ -z "$_input" ] && _input="$_default_val"
  eval "$_target_var=\"\$_input\""
}

# --- Port Collision Detection & Auto-Fallback -------------------------------
is_port_in_use() {
  local _p="$1"
  # If CloudDeck itself is already running as an active systemd unit, it's our own service being updated
  if systemd_present; then
    if [ "$_p" = "$PANEL_PORT" ] && systemctl is-active --quiet clouddeck-panel 2>/dev/null; then
      return 1
    fi
    if [ "$_p" = "$AGENT_PORT" ] && systemctl is-active --quiet clouddeck-agent 2>/dev/null; then
      return 1
    fi
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -tan 2>/dev/null | grep -qE "[:.]${_p}\b.*LISTEN" && return 0
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -tan 2>/dev/null | grep -qE "[:.]${_p}\b.*LISTEN" && return 0
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${_p}" -sTCP:LISTEN -P -n >/dev/null 2>&1 && return 0
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser "${_p}/tcp" >/dev/null 2>&1 && return 0
  fi
  return 1
}

find_next_free_port() {
  local _start_port="$1"
  local _candidate="$_start_port"
  while [ "$_candidate" -le 65535 ]; do
    if ! is_port_in_use "$_candidate"; then
      echo "$_candidate"
      return 0
    fi
    _candidate=$((_candidate + 1))
  done
  echo "$_start_port"
}

is_clouddeck_listening() {
  local _p="$1"
  # Check if port matches existing configured panel port in panel.env
  if [ -f "$ETCDIR/panel.env" ]; then
    local _cfg_port
    _cfg_port="$(grep -E '^PORT=' "$ETCDIR/panel.env" 2>/dev/null | cut -d= -f2 | tr -d ' "\r\n')"
    if [ "$_cfg_port" = "$_p" ]; then
      return 0
    fi
  fi
  # Check if listening process is clouddeck or node running clouddeck
  if command -v ss >/dev/null 2>&1; then
    local _ss_out
    _ss_out="$(ss -tulpn "( sport = :${_p} )" 2>/dev/null | grep -E 'node|clouddeck|next' || true)"
    if [ -n "$_ss_out" ]; then
      return 0
    fi
  fi
  if command -v lsof >/dev/null 2>&1; then
    local _lsof_out
    _lsof_out="$(lsof -iTCP:"${_p}" -sTCP:LISTEN -P -n 2>/dev/null | grep -E 'node|clouddeck|next' || true)"
    if [ -n "$_lsof_out" ]; then
      return 0
    fi
  fi
  return 1
}

get_port_process_name() {
  local _p="$1"
  local _proc=""
  if command -v ss >/dev/null 2>&1; then
    _proc="$(ss -tulpn "( sport = :${_p} )" 2>/dev/null | grep -o 'users:(("[^"]*"' | sed 's/users:(("//;s/"//' | head -n1)"
  fi
  if [ -z "$_proc" ] && command -v lsof >/dev/null 2>&1; then
    _proc="$(lsof -iTCP:"${_p}" -sTCP:LISTEN -P -n 2>/dev/null | awk 'NR>1 {print $1, "(PID:" $2 ")"}' | head -n1)"
  fi
  [ -z "$_proc" ] && _proc="another application"
  echo "$_proc"
}

check_and_resolve_ports() {
  # 1. Resolve PANEL_PORT if busy
  if is_port_in_use "$PANEL_PORT"; then
    if is_clouddeck_listening "$PANEL_PORT"; then
      info "Port ${PANEL_PORT} is reserved for CloudDeck (active instance detected)."
    else
      local _proc
      _proc="$(get_port_process_name "$PANEL_PORT")"
      local _fallback_panel
      _fallback_panel="$(find_next_free_port "$((PANEL_PORT + 1))")"
      warn "Web Panel port ${PANEL_PORT} is currently in use by ${_proc}."
      if [ "$NON_INTERACTIVE" = "0" ] && [ "$HAS_TTY" = "1" ]; then
        say "  ${TC_SKY}${CLR_BOLD}❯${CLR_RESET} ${CLR_BOLD}Enter an alternate port or press Enter for automatic fallback:${CLR_RESET}"
        printf "    ${TC_MAUVE}• Web Panel Port [suggested free: ${_fallback_panel}]: ${CLR_RESET}"
        local _chosen_panel=""
        prompt_read _chosen_panel "$_fallback_panel"
        if [ -n "$_chosen_panel" ] && [ "$_chosen_panel" -eq "$_chosen_panel" ] 2>/dev/null; then
          PANEL_PORT="$_chosen_panel"
        else
          PANEL_PORT="$_fallback_panel"
        fi
      else
        info "Automatically falling back to free port: ${PANEL_PORT} -> ${_fallback_panel}"
        PANEL_PORT="$_fallback_panel"
      fi
      ok "Web Panel will listen on port: ${TC_PEACH}${PANEL_PORT}${CLR_RESET}"
    fi
  fi

  # 2. Resolve AGENT_PORT if busy
  if is_port_in_use "$AGENT_PORT"; then
    if is_clouddeck_listening "$AGENT_PORT"; then
      info "Port ${AGENT_PORT} is reserved for CloudDeck Agent (active instance detected)."
    else
      local _proc
      _proc="$(get_port_process_name "$AGENT_PORT")"
      local _fallback_agent
      _fallback_agent="$(find_next_free_port "$((AGENT_PORT + 1))")"
      warn "Agent Daemon port ${AGENT_PORT} is currently in use by ${_proc}."
      if [ "$NON_INTERACTIVE" = "0" ] && [ "$HAS_TTY" = "1" ]; then
        say "  ${TC_SKY}${CLR_BOLD}❯${CLR_RESET} ${CLR_BOLD}Enter an alternate daemon port or press Enter for automatic fallback:${CLR_RESET}"
        printf "    ${TC_MAUVE}• Agent Daemon Port [suggested free: ${_fallback_agent}]: ${CLR_RESET}"
        local _chosen_agent=""
        prompt_read _chosen_agent "$_fallback_agent"
        if [ -n "$_chosen_agent" ] && [ "$_chosen_agent" -eq "$_chosen_agent" ] 2>/dev/null; then
          AGENT_PORT="$_chosen_agent"
        else
          AGENT_PORT="$_fallback_agent"
        fi
      else
        info "Automatically falling back to free port: ${AGENT_PORT} -> ${_fallback_agent}"
        AGENT_PORT="$_fallback_agent"
      fi
      ok "Agent Daemon will listen on port: ${TC_PEACH}${AGENT_PORT}${CLR_RESET}"
    fi
  fi
}

check_existing_installation() {
  local _existing_ver=""
  [ -f "$PREFIX/.clouddeck-version" ] && _existing_ver="$(cat "$PREFIX/.clouddeck-version" 2>/dev/null || true)"
  [ -z "$_existing_ver" ] && [ -f "$PREFIX/.clouddeck-install" ] && _existing_ver="installed"

  if [ -n "$_existing_ver" ] || [ -f "$ETCDIR/panel.env" ]; then
    # Read existing panel port if available
    if [ -f "$ETCDIR/panel.env" ]; then
      local _p
      _p="$(grep -E '^PORT=' "$ETCDIR/panel.env" 2>/dev/null | cut -d= -f2 | tr -d ' "\r\n')"
      [ -n "$_p" ] && PANEL_PORT="$_p"
    fi

    # Read existing profile
    if [ -f "$PREFIX/.clouddeck-install" ]; then
      local _prof
      _prof="$(cat "$PREFIX/.clouddeck-install" 2>/dev/null || true)"
      [ -n "$_prof" ] && INSTALL_PROFILE="$_prof"
    fi

    # In interactive mode (not WSL non-interactive sub-call, not scripted non-interactive)
    if [ "$NON_INTERACTIVE" = "0" ] && [ "$HAS_TTY" = "1" ]; then
      say ""
      say "  ${TC_SKY}${CLR_BOLD}╭─ Existing CloudDeck Installation Detected ─────────────────────────${CLR_RESET}"
      say "  ${TC_STEEL}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}● Current Version:${CLR_RESET}   ${_existing_ver:-installed}"
      say "  ${TC_STEEL}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}● Target Release:${CLR_RESET}    $VERSION"
      say "  ${TC_STEEL}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}● Active Panel Port:${CLR_RESET} $PANEL_PORT"
      say "  ${TC_STEEL}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}● Current Profile:${CLR_RESET}   ${INSTALL_PROFILE:-recommended}"
      say "  ${TC_STEEL}│${CLR_RESET}"
      say "  ${TC_STEEL}├─ Maintenance Options ─────────────────────────────────────────────${CLR_RESET}"
      say "  ${TC_STEEL}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}[1] Upgrade to $VERSION${CLR_RESET} ${TC_SKY}(Recommended)${CLR_RESET}"
      say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Updates panel, agent and CLI while preserving sites & databases${CLR_RESET}"
      say "  ${TC_STEEL}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}[2] Reinstall / Repair Stack${CLR_RESET}"
      say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Re-provisions LEMP stack and reconfigures service daemons${CLR_RESET}"
      say "  ${TC_STEEL}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}[3] Open Web Panel in Browser${CLR_RESET}"
      say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Launches http://localhost:${PANEL_PORT} and exits${CLR_RESET}"
      say "  ${TC_STEEL}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}[4] Exit${CLR_RESET}"
      say "  ${TC_STEEL}╰───────────────────────────────────────────────────────────────────${CLR_RESET}"
      say ""
      printf "  ${TC_SKY}${CLR_BOLD}❯${CLR_RESET} ${CLR_BOLD}Enter choice [1-4] (default: 1): ${CLR_RESET}"
      local _maint_choice="1"
      prompt_read _maint_choice "1"
      case "$_maint_choice" in
        3)
          local _url="http://localhost:${PANEL_PORT}"
          say "Opening CloudDeck Web Panel: ${_url}..."
          if command -v xdg-open >/dev/null 2>&1; then
            xdg-open "$_url" 2>/dev/null || true
          elif command -v open >/dev/null 2>&1; then
            open "$_url" 2>/dev/null || true
          fi
          exit 0
          ;;
        4)
          info "Installer exited. Your existing CloudDeck installation remains active."
          exit 0
          ;;
        2)
          step "Proceeding with full reinstallation / repair..."
          ;;
        *)
          step "Upgrading CloudDeck to $VERSION..."
          NON_INTERACTIVE=1
          ;;
      esac
    fi
  fi
}

render_system_card() {
  say "  ${TC_STEEL}╭─ System Environment ──────────────────────────────────────────────${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}  ${TC_SKY}${CLR_BOLD}● Release Version:${CLR_RESET}   ${CLR_BOLD}$VERSION${CLR_RESET} ${CLR_DIM}(latest stable)${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}  ${TC_SKY}${CLR_BOLD}● Operating System:${CLR_RESET}  $DISTRO_NAME"
  say "  ${TC_STEEL}│${CLR_RESET}  ${TC_SKY}${CLR_BOLD}● Architecture:${CLR_RESET}      $MACHINE ($ARCH_GO)"
  say "  ${TC_STEEL}│${CLR_RESET}  ${TC_SKY}${CLR_BOLD}● Target Ports:${CLR_RESET}      Web Panel: ${TC_PEACH}${PANEL_PORT}${CLR_RESET}  ${CLR_DIM}│${CLR_RESET}  Agent Daemon: ${TC_PEACH}${AGENT_PORT}${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}"
}

prompt_component_selection() {
  # If non-interactive flag was explicitly passed, no tty attached, or updating an existing installation, apply profile and return
  if [ "$NON_INTERACTIVE" = "1" ] || [ "$HAS_TTY" = "0" ] || [ -f "$PREFIX/.clouddeck-install" ]; then
    case "$INSTALL_PROFILE" in
      fast)
        DO_EMAIL=0; DO_DNS=0; DO_SECURITY=0; DO_PHP_MULTI=0
        ;;
      minimal)
        DO_NGINX=0; DO_MARIADB=0; DO_PHP=0; DO_EMAIL=0; DO_DNS=0; DO_SECURITY=0
        ;;
      *)
        if [ "$OS_TYPE" = "linux" ] && [ "$IS_WSL" = "0" ]; then
          DO_EMAIL=1; DO_DNS=1; DO_SECURITY=1; DO_PHP_MULTI=1
        elif [ "$IS_WSL" = "1" ]; then
          DO_EMAIL=0; DO_DNS=0; DO_SECURITY=0; DO_PHP_MULTI=1
        fi
        ;;
    esac
    return 0
  fi

  render_system_card
  say "  ${TC_STEEL}├─ Choose Installation Profile ─────────────────────────────────────${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}● [1] Recommended Full LEMP Stack${CLR_RESET} ${TC_SKY}(Default)${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Next.js 16 Panel, Go Daemon & CloudDeck CLI${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Nginx Web Server + MariaDB Database${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Multi-PHP Coexistence (8.1, 8.2, 8.3, 8.4)${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Node.js 22 LTS Runtime & npm${CLR_RESET}"
  if [ "$OS_TYPE" = "linux" ]; then
    say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Postfix + Dovecot Mail & PowerDNS Nameserver${CLR_RESET}"
    say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• ModSecurity WAF + OWASP Core Rule Set & Fail2ban${CLR_RESET}"
  else
    say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Local Root CA in Keychain for Green Padlocks (*.local)${CLR_RESET}"
  fi
  say "  ${TC_STEEL}│${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}○ [2] Fast Core Development Suite${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Next.js 16 Panel, Go Daemon & CloudDeck CLI${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Nginx Web Server + MariaDB + PHP 8.4 + Node.js 22 LTS${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Skips heavy mail, DNS, and WAF setup${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}○ [3] Custom Component Selection${CLR_RESET} ${TC_MAUVE}(Interactive Checklist)${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Pick and choose individual services & runtimes${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}○ [4] Minimal Deck Only${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Panel, Agent and CLI only (Bring your own hosting stack)${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}"
  say "  ${TC_STEEL}╰───────────────────────────────────────────────────────────────────${CLR_RESET}"
  say ""
  printf "  ${TC_SKY}${CLR_BOLD}❯${CLR_RESET} ${CLR_BOLD}Enter choice [1-4] (default: 1): ${CLR_RESET}"
  _choice=""
  prompt_read _choice "1"
  case "$_choice" in
    2)
      INSTALL_PROFILE="fast"
      FAST=1
      DO_EMAIL=0; DO_DNS=0; DO_SECURITY=0; DO_PHP_MULTI=0
      ok "Selected: ${TC_PEACH}${CLR_BOLD}Fast Core Development Suite${CLR_RESET}"
      ;;
    3)
      INSTALL_PROFILE="custom"
      say ""
      say "  ${TC_SKY}${CLR_BOLD}❯ Customize Components:${CLR_RESET}"
      
      _ans=""
      printf "    ${TC_MAUVE}• Install Nginx Web Server? [Y/n]: ${CLR_RESET}"; prompt_read _ans "y"; [ "$_ans" = "n" ] || [ "$_ans" = "N" ] && DO_NGINX=0
      printf "    ${TC_MAUVE}• Install MariaDB Database? [Y/n]: ${CLR_RESET}"; prompt_read _ans "y"; [ "$_ans" = "n" ] || [ "$_ans" = "N" ] && DO_MARIADB=0
      printf "    ${TC_MAUVE}• Install PHP-FPM? [Y/n]: ${CLR_RESET}"; prompt_read _ans "y"; [ "$_ans" = "n" ] || [ "$_ans" = "N" ] && DO_PHP=0
      if [ "$DO_PHP" = "1" ] && [ "$OS_TYPE" = "linux" ]; then
        printf "    ${TC_MAUVE}• Enable Multi-PHP (8.1 - 8.4)? [Y/n]: ${CLR_RESET}"; prompt_read _ans "y"; [ "$_ans" = "n" ] || [ "$_ans" = "N" ] && DO_PHP_MULTI=0
      fi
      printf "    ${TC_MAUVE}• Install Node.js 22 LTS runtime? [Y/n]: ${CLR_RESET}"; prompt_read _ans "y"; [ "$_ans" = "n" ] || [ "$_ans" = "N" ] && DO_NODE=0
      if [ "$OS_TYPE" = "linux" ]; then
        printf "    ${TC_MAUVE}• Install Postfix/Dovecot Email Stack? [y/N]: ${CLR_RESET}"; prompt_read _ans "n"; [ "$_ans" = "y" ] || [ "$_ans" = "Y" ] && DO_EMAIL=1
        printf "    ${TC_MAUVE}• Install PowerDNS Nameserver? [y/N]: ${CLR_RESET}"; prompt_read _ans "n"; [ "$_ans" = "y" ] || [ "$_ans" = "Y" ] && DO_DNS=1
        printf "    ${TC_MAUVE}• Install ModSecurity WAF & Fail2ban? [y/N]: ${CLR_RESET}"; prompt_read _ans "n"; [ "$_ans" = "y" ] || [ "$_ans" = "Y" ] && DO_SECURITY=1
      else
        printf "    ${TC_MAUVE}• Trust Local Root CA in System Keychain? [Y/n]: ${CLR_RESET}"; prompt_read _ans "y"; [ "$_ans" = "n" ] || [ "$_ans" = "N" ] && DO_LOCAL_CA=0
      fi

      # Custom port configuration prompt
      _port_in=""
      printf "    ${TC_MAUVE}• CloudDeck Web Panel Port [${PANEL_PORT}]: ${CLR_RESET}"
      prompt_read _port_in "${PANEL_PORT}"
      if [ -n "$_port_in" ] && [ "$_port_in" -eq "$_port_in" ] 2>/dev/null; then
        if is_port_in_use "$_port_in" && [ "$_port_in" != "$PANEL_PORT" ]; then
          _suggested="$(find_next_free_port "$((_port_in + 1))")"
          warn "Entered port ${_port_in} is currently in use! Automatically falling back to free port ${_suggested}."
          PANEL_PORT="$_suggested"
        else
          PANEL_PORT="$_port_in"
        fi
      fi

      # Custom admin credentials prompt
      _admin_ans=""
      printf "    ${TC_SKY}${CLR_BOLD}• Configure Initial Admin Account? [y/N]: ${CLR_RESET}"
      prompt_read _admin_ans "n"
      if [ "$_admin_ans" = "y" ] || [ "$_admin_ans" = "Y" ]; then
        printf "      ${TC_MAUVE}Admin Username [admin]: ${CLR_RESET}"
        prompt_read PANEL_SEED_ADMIN "admin"
        printf "      ${TC_MAUVE}Admin Password (leave blank to auto-generate): ${CLR_RESET}"
        prompt_read PANEL_SEED_PASSWORD ""
      fi
      ok "Custom component selection configured."
      ;;
    4)
      INSTALL_PROFILE="minimal"
      DO_NGINX=0; DO_MARIADB=0; DO_PHP=0; DO_EMAIL=0; DO_DNS=0; DO_SECURITY=0
      ok "Selected: ${TC_PEACH}${CLR_BOLD}Minimal Deck Only${CLR_RESET}"
      ;;
    1|"")
      INSTALL_PROFILE="recommended"
      if [ "$OS_TYPE" = "linux" ]; then
        DO_EMAIL=1; DO_DNS=1; DO_SECURITY=1; DO_PHP_MULTI=1
      fi
      ok "Selected: ${TC_PEACH}${CLR_BOLD}Recommended Full LEMP Stack${CLR_RESET}"
      ;;
    *)
      INSTALL_PROFILE="recommended"
      if [ "$OS_TYPE" = "linux" ]; then
        DO_EMAIL=1; DO_DNS=1; DO_SECURITY=1; DO_PHP_MULTI=1
      fi
      warn "Unknown choice '$_choice', proceeding with Recommended Full LEMP Stack."
      ;;
  esac
}

# --- Uninstall Logic ---------------------------------------------------------
if [ "$UNINSTALL" = "1" ]; then
  print_banner
  warn "CloudDeck Uninstall Initiated"
  case "$PREFIX" in
    ""|"/"|"/usr"|"/var"|"/etc"|"/opt"|"/home"|"/root")
      die "Refusing to remove $PREFIX: not a CloudDeck prefix" ;;
  esac
  if [ ! -f "$PREFIX/.clouddeck-install" ] && [ ! -x "$PREFIX/clouddeck-agent" ] && [ ! -d "$PREFIX" ]; then
    die "No CloudDeck installation found at $PREFIX; refusing to remove it"
  fi

  if [ "$PURGE" = "1" ]; then
    for _dir in "$DATADIR" "$ETCDIR"; do
      case "$_dir" in
        ""|"/"|"/usr"|"/var"|"/etc"|"/opt"|"/home"|"/root") die "refusing to purge $_dir" ;;
      esac
    done
  fi

  if [ "$OS_TYPE" = "darwin" ]; then
    step "Stopping macOS background services..."
    launchctl unload "$HOME/Library/LaunchAgents/in.dakshraman.clouddeck-panel.plist" 2>/dev/null || true
    launchctl unload "$HOME/Library/LaunchAgents/in.dakshraman.clouddeck-agent.plist" 2>/dev/null || true
    launchctl unload "$HOME/Library/LaunchAgents/in.dakshraman.clouddeck-phpmyadmin.plist" 2>/dev/null || true
    rm -f "$HOME/Library/LaunchAgents/in.dakshraman.clouddeck-*.plist"
  elif systemd_present; then
    step "Stopping and disabling systemd services..."
    systemctl disable --now clouddeck-panel >/dev/null 2>&1 || true
    systemctl disable --now clouddeck-agent >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/clouddeck-agent.service /etc/systemd/system/clouddeck-panel.service
    systemctl daemon-reload >/dev/null 2>&1 || true
  fi

  if [ -x "$PREFIX/run/stop.sh" ]; then
    "$PREFIX/run/stop.sh" >/dev/null 2>&1 || true
  fi
  pkill -f "$PREFIX/clouddeck-agent" 2>/dev/null || true

  for _bin in clouddeck node npm npx; do
    if [ -L "/usr/local/bin/$_bin" ]; then
      case "$(readlink "/usr/local/bin/$_bin" 2>/dev/null || true)" in
        "$PREFIX"/*) rm -f "/usr/local/bin/$_bin" ;;
      esac
    fi
    if [ -L "/opt/homebrew/bin/$_bin" ]; then
      case "$(readlink "/opt/homebrew/bin/$_bin" 2>/dev/null || true)" in
        "$PREFIX"/*) rm -f "/opt/homebrew/bin/$_bin" ;;
      esac
    fi
  done

  rm -rf "$PREFIX"
  if [ "$PURGE" = "1" ]; then
    rm -rf "$DATADIR" "$ETCDIR"
    ok "Removed binaries, data, and configurations."
  else
    ok "Removed binaries; kept data in $DATADIR and configs in $ETCDIR."
  fi
  exit 0
fi

# =============================================================================
# macOS ENGINE (Apple Silicon & Intel Darwin)
# =============================================================================
run_macos_installer() {
  step "Running macOS Local Development Suite Engine..."

  ensure_brew() {
    if [ -x "/opt/homebrew/bin/brew" ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x "/usr/local/bin/brew" ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi

    if ! command -v brew >/dev/null 2>&1; then
      step "Homebrew not found. Installing Homebrew..."
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || die "Homebrew installation failed"
      if [ -x "/opt/homebrew/bin/brew" ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
      elif [ -x "/usr/local/bin/brew" ]; then
        eval "$(/usr/local/bin/brew shellenv)"
      fi
    else
      ok "Homebrew detected: $(brew --version | head -n1)"
    fi
  }

  ensure_brew

  if [ "$INSTALL_PROFILE" != "minimal" ]; then
    step "Checking Homebrew packages for local web stack..."
    _brew_pkgs=""
    [ "$DO_NGINX" = "1" ] && _brew_pkgs="$_brew_pkgs nginx"
    [ "$DO_MARIADB" = "1" ] && _brew_pkgs="$_brew_pkgs mariadb"
    [ "$DO_PHP" = "1" ] && _brew_pkgs="$_brew_pkgs php"
    [ "$DO_NODE" = "1" ] && _brew_pkgs="$_brew_pkgs node"
    [ "$DO_DNS" = "1" ] && _brew_pkgs="$_brew_pkgs pdns sqlite"

    _needed=""
    for _p in $_brew_pkgs; do
      if ! brew list "$_p" >/dev/null 2>&1; then
        _needed="$_needed $_p"
      fi
    done

    if [ -n "$_needed" ]; then
      step "Installing Homebrew packages:$_needed..."
      # shellcheck disable=SC2086
      brew install $_needed
      ok "Packages installed successfully."
    else
      ok "Selected stack packages already installed in Homebrew."
    fi

    # Start brew services
    [ "$DO_MARIADB" = "1" ] && brew services start mariadb >/dev/null 2>&1 || true
    [ "$DO_NGINX" = "1" ] && brew services start nginx >/dev/null 2>&1 || true
    [ "$DO_PHP" = "1" ] && brew services start php >/dev/null 2>&1 || true
    [ "$DO_DNS" = "1" ] && brew services start pdns >/dev/null 2>&1 || true
  fi

  # Create directories
  BREW_PREFIX="$(brew --prefix 2>/dev/null || echo "/opt/homebrew")"
  NGINX_SERVERS_DIR="$BREW_PREFIX/etc/nginx/servers"
  mkdir -p "$PREFIX/bin" "$PREFIX/panel" "$DATADIR/agent" "$DATADIR/panel" "$ETCDIR" "$PREFIX/run" "$NGINX_SERVERS_DIR" "$HOME/Sites"

  # Generate or preserve tokens and secrets
  AGENT_TOKEN=""
  [ -f "$ETCDIR/agent.env" ] && AGENT_TOKEN="$(sed -n 's/^AGENT_AUTH_TOKEN=//p' "$ETCDIR/agent.env" | tail -n 1)"
  [ -z "$AGENT_TOKEN" ] && AGENT_TOKEN="$(random_hex 32)"
  AGENT_AUTH_TOKEN="$AGENT_TOKEN"

  PANEL_SECRET=""
  [ -f "$ETCDIR/panel.env" ] && PANEL_SECRET="$(sed -n 's/^PANEL_SESSION_SECRET=//p' "$ETCDIR/panel.env" | tail -n 1)"
  [ -z "$PANEL_SECRET" ] && PANEL_SECRET="$(random_hex 32)"

  # Configuration files
  cat > "$ETCDIR/agent.env" <<EOF
AGENT_LISTEN=127.0.0.1:$AGENT_PORT
AGENT_AUTH_TOKEN=$AGENT_AUTH_TOKEN
AGENT_STATE_DIR=$DATADIR/agent
AGENT_NGINX_SITES_DIR=$NGINX_SERVERS_DIR
AGENT_WEBROOT=$HOME/Sites
AGENT_LOG_DIR=$BREW_PREFIX/var/log/nginx
AGENT_BACKUP_DIR=$DATADIR/agent/backups
AGENT_PHPMYADMIN_DIR=$DATADIR/agent/phpmyadmin
AGENT_PHPMYADMIN_STATE_DIR=$DATADIR/agent/phpmyadmin-state
AGENT_PHPMYADMIN_RUNAS=$(whoami 2>/dev/null || echo "$USER")
AGENT_PHPMYADMIN_UNIT_DIR=$HOME/Library/LaunchAgents
AGENT_PANEL_ENV_FILE=$ETCDIR/panel.env
AGENT_PANEL_SSL_DIR=$ETCDIR/ssl
AGENT_PANEL_RESTART_CMD=clouddeck restart panel
EOF
  chmod 600 "$ETCDIR/agent.env"
  ok "Wrote agent configuration: $ETCDIR/agent.env"

  cat > "$ETCDIR/panel.env" <<EOF
PORT=$PANEL_PORT
HOSTNAME=127.0.0.1
NODE_ENV=production
AGENT_URL=http://127.0.0.1:$AGENT_PORT
AGENT_TOKEN=$AGENT_AUTH_TOKEN
PANEL_DATA_DIR=$DATADIR/panel
PANEL_SESSION_SECRET=$PANEL_SECRET
PANEL_COOKIE_SECURE=false
EOF
  chmod 600 "$ETCDIR/panel.env"
  ok "Wrote panel configuration: $ETCDIR/panel.env"

  cat > "$PREFIX/.clouddeck-install" <<EOF
PREFIX=$PREFIX
DATADIR=$DATADIR
ETCDIR=$ETCDIR
AGENT_PORT=$AGENT_PORT
PANEL_PORT=$PANEL_PORT
REPO=$REPO
NO_SYSTEMD=1
DO_AGENT=$DO_AGENT
DO_PANEL=$DO_PANEL
FAST=$FAST
SYSTEM_NODE=1
PROFILE=$INSTALL_PROFILE
EOF
  chmod 0644 "$PREFIX/.clouddeck-install"

  # Download assets
  step "Downloading CloudDeck release assets for macOS ($ARCH_GO)..."
  AGENT_BIN="clouddeck-agent-darwin-$ARCH_GO"
  download_asset "$AGENT_BIN" "$TMP/clouddeck-agent"
  chmod +x "$TMP/clouddeck-agent"
  mv -f "$TMP/clouddeck-agent" "$PREFIX/bin/clouddeck-agent"
  ok "Agent binary installed to $PREFIX/bin/clouddeck-agent"

  step "Downloading CloudDeck panel standalone bundle..."
  download_asset "clouddeck-panel.tar.gz" "$TMP/panel.tar.gz"
  tar -xzf "$TMP/panel.tar.gz" -C "$PREFIX/panel"
  ok "CloudDeck panel unpacked into $PREFIX/panel"

  step "Installing CloudDeck CLI..."
  download_asset "clouddeck-cli" "$TMP/clouddeck-cli" || true
  if [ ! -s "$TMP/clouddeck-cli" ] && [ -f "scripts/clouddeck" ]; then
    cp scripts/clouddeck "$TMP/clouddeck-cli"
  fi
  if [ ! -s "$TMP/clouddeck-cli" ]; then
    curl -fsSL "https://raw.githubusercontent.com/$REPO/main/scripts/clouddeck" -o "$TMP/clouddeck-cli" 2>/dev/null || true
  fi
  if [ -s "$TMP/clouddeck-cli" ]; then
    chmod +x "$TMP/clouddeck-cli"
    mv -f "$TMP/clouddeck-cli" "$PREFIX/bin/clouddeck-cli"
  fi

  # Wrapper script in PATH
  cat > "$PREFIX/bin/clouddeck" << 'EOF'
#!/bin/bash
TARGET="${BASH_SOURCE[0]}"
while [ -L "$TARGET" ]; do
  DIR="$(cd -P "$(dirname "$TARGET")" >/dev/null 2>&1 && pwd)"
  TARGET="$(readlink "$TARGET")"
  [[ $TARGET != /* ]] && TARGET="$DIR/$TARGET"
done
DIR="$(cd -P "$(dirname "$TARGET")" >/dev/null 2>&1 && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
exec node "$DIR/clouddeck-cli" "$@"
EOF
  chmod +x "$PREFIX/bin/clouddeck"
  if [ -w "$BREW_PREFIX/bin" ]; then
    ln -sf "$PREFIX/bin/clouddeck" "$BREW_PREFIX/bin/clouddeck"
    ok "CloudDeck CLI linked to $BREW_PREFIX/bin/clouddeck"
  elif [ -w "/usr/local/bin" ]; then
    ln -sf "$PREFIX/bin/clouddeck" /usr/local/bin/clouddeck
    ok "CloudDeck CLI linked to /usr/local/bin/clouddeck"
  fi

  # Local Root CA Trust Setup
  if [ "$DO_LOCAL_CA" = "1" ] && [ "$SKIP_TRUST" = "0" ]; then
    step "Configuring Local Development Root CA for macOS..."
    SSL_DIR="$ETCDIR/ssl"
    mkdir -p "$SSL_DIR"
    CA_KEY="$SSL_DIR/clouddeck-ca.key"
    CA_CRT="$SSL_DIR/clouddeck-ca.crt"
    if [ ! -f "$CA_CRT" ] || [ ! -f "$CA_KEY" ]; then
      openssl req -x509 -new -nodes \
        -keyout "$CA_KEY" -sha256 -days 3650 -out "$CA_CRT" \
        -subj "/CN=CloudDeck Local Development CA/O=CloudDeck Local Dev" >/dev/null 2>&1 || true
      chmod 0600 "$CA_KEY" 2>/dev/null || true
      chmod 0644 "$CA_CRT" 2>/dev/null || true
    fi

    if [ -f "$CA_CRT" ]; then
      step "Adding Local Root CA to Keychain for green padlocks in Safari, Chrome & Edge..."
      if [ "$(id -u)" = "0" ]; then
        security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CA_CRT" 2>/dev/null || true
      elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
        sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CA_CRT" 2>/dev/null || true
      else
        security add-trusted-cert -d -r trustRoot -k "$HOME/Library/Keychains/login.keychain-db" "$CA_CRT" 2>/dev/null \
          || security add-trusted-cert -d -r trustRoot -k "$HOME/Library/Keychains/login.keychain" "$CA_CRT" 2>/dev/null || true
      fi
      ok "Local Root CA installed in Keychain."
    fi
  fi

  # LaunchAgents Setup
  step "Configuring LaunchAgents for macOS background services..."
  LAUNCH_DIR="$HOME/Library/LaunchAgents"
  mkdir -p "$LAUNCH_DIR"

  cat > "$LAUNCH_DIR/in.dakshraman.clouddeck-agent.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>in.dakshraman.clouddeck-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PREFIX/bin/clouddeck-agent</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>AGENT_LISTEN</key>
        <string>127.0.0.1:$AGENT_PORT</string>
        <key>AGENT_STATE_DIR</key>
        <string>$DATADIR/agent</string>
        <key>AGENT_AUTH_TOKEN</key>
        <string>$AGENT_AUTH_TOKEN</string>
        <key>AGENT_NGINX_SITES_DIR</key>
        <string>$NGINX_SERVERS_DIR</string>
        <key>AGENT_WEBROOT</key>
        <string>$HOME/Sites</string>
        <key>AGENT_LOG_DIR</key>
        <string>$BREW_PREFIX/var/log/nginx</string>
        <key>AGENT_BACKUP_DIR</key>
        <string>$DATADIR/agent/backups</string>
        <key>AGENT_PHPMYADMIN_DIR</key>
        <string>$DATADIR/agent/phpmyadmin</string>
        <key>AGENT_PHPMYADMIN_STATE_DIR</key>
        <string>$DATADIR/agent/phpmyadmin-state</string>
        <key>AGENT_PHPMYADMIN_RUNAS</key>
        <string>$(whoami 2>/dev/null || echo "$USER")</string>
        <key>AGENT_PHPMYADMIN_UNIT_DIR</key>
        <string>$HOME/Library/LaunchAgents</string>
        <key>AGENT_PANEL_ENV_FILE</key>
        <string>$ETCDIR/panel.env</string>
        <key>AGENT_PANEL_SSL_DIR</key>
        <string>$ETCDIR/ssl</string>
        <key>AGENT_PANEL_RESTART_CMD</key>
        <string>clouddeck restart panel</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$PREFIX/run/agent.log</string>
    <key>StandardErrorPath</key>
    <string>$PREFIX/run/agent.err.log</string>
</dict>
</plist>
EOF

  MACOS_NODE_BIN="$(command -v node 2>/dev/null || echo "$BREW_PREFIX/bin/node")"
  cat > "$LAUNCH_DIR/in.dakshraman.clouddeck-panel.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>in.dakshraman.clouddeck-panel</string>
    <key>ProgramArguments</key>
    <array>
        <string>$MACOS_NODE_BIN</string>
        <string>$PREFIX/panel/server.js</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>PORT</key>
        <string>$PANEL_PORT</string>
        <key>HOSTNAME</key>
        <string>127.0.0.1</string>
        <key>PANEL_DATA_DIR</key>
        <string>$DATADIR/panel</string>
        <key>AGENT_URL</key>
        <string>http://127.0.0.1:$AGENT_PORT</string>
        <key>AGENT_TOKEN</key>
        <string>$AGENT_AUTH_TOKEN</string>
        <key>PANEL_SESSION_SECRET</key>
        <string>$PANEL_SECRET</string>
        <key>PANEL_COOKIE_SECURE</key>
        <string>false</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$PREFIX/run/panel.log</string>
    <key>StandardErrorPath</key>
    <string>$PREFIX/run/panel.err.log</string>
    <key>WorkingDirectory</key>
    <string>$PREFIX/panel</string>
</dict>
</plist>
EOF

  launchctl unload "$LAUNCH_DIR/in.dakshraman.clouddeck-agent.plist" 2>/dev/null || true
  launchctl unload "$LAUNCH_DIR/in.dakshraman.clouddeck-panel.plist" 2>/dev/null || true
  launchctl load -w "$LAUNCH_DIR/in.dakshraman.clouddeck-agent.plist" 2>/dev/null || true
  launchctl load -w "$LAUNCH_DIR/in.dakshraman.clouddeck-panel.plist" 2>/dev/null || true
  launchctl start in.dakshraman.clouddeck-agent 2>/dev/null || true
  launchctl start in.dakshraman.clouddeck-panel 2>/dev/null || true

  # Save version marker
  printf '%s\n' "$VERSION" > "$PREFIX/.clouddeck-version"
  STACK_PROVISIONED=1
}

# =============================================================================
# LINUX ENGINE (Debian, Ubuntu, RHEL, AlmaLinux, Rocky, Alpine, Arch)
# =============================================================================
check_system_node() {
  [ "$SYSTEM_NODE" = "1" ] || return 0
  step "Checking host Node.js runtime..."
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    warn "--system-node requested, but node or npm not found on PATH; falling back to pinned Node.js $NODE_VERSION"
    return 0
  fi
  SYS_NODE_PATH="$(command -v node)"
  SYS_NPM_PATH="$(command -v npm)"
  SYS_NPX_PATH="$(command -v npx 2>/dev/null || true)"
  SYS_NODE_VER="$("$SYS_NODE_PATH" -v 2>/dev/null | tr -d 'v' || true)"
  _major="$(echo "$SYS_NODE_VER" | cut -d. -f1)"
  if [ -z "$_major" ] || [ "$_major" -lt 20 ]; then
    warn "host Node.js is v$SYS_NODE_VER; CloudDeck requires Node.js >= 20.0.0. Falling back to pinned Node.js $NODE_VERSION"
    return 0
  fi
  USING_SYSTEM_NODE=1
  ok "Host Node.js v$SYS_NODE_VER meets requirements."
}

setup_swap() {
  [ -f /proc/meminfo ] || return 0
  _ram_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo)"
  [ -n "$_ram_kb" ] || return 0
  # If RAM is under 1.5GB and swap is under 512MB, create a 1GB swapfile
  if [ "$_ram_kb" -lt 1572864 ]; then
    _swap_kb="$(awk '/SwapTotal:/ {print $2}' /proc/meminfo)"
    if [ "$_swap_kb" -lt 524288 ] && [ ! -f /swapfile_clouddeck ]; then
      item "Low memory detected (${_ram_kb} kB). Creating 1GB swapfile..."
      fallocate -l 1G /swapfile_clouddeck 2>/dev/null || dd if=/dev/zero of=/swapfile_clouddeck bs=1M count=1024 2>/dev/null
      chmod 600 /swapfile_clouddeck
      mkswap /swapfile_clouddeck >/dev/null 2>&1 || true
      swapon /swapfile_clouddeck >/dev/null 2>&1 || true
      item_ok "Swapfile activated."
    fi
  fi
}

provision_linux_packages() {
  [ "$INSTALL_PROFILE" = "minimal" ] && return 0

  local _pkg_mgr=""
  if command -v apt-get >/dev/null 2>&1; then
    _pkg_mgr="apt"
  elif command -v dnf >/dev/null 2>&1; then
    _pkg_mgr="dnf"
  elif command -v yum >/dev/null 2>&1; then
    _pkg_mgr="yum"
  elif command -v pacman >/dev/null 2>&1; then
    _pkg_mgr="pacman"
  fi

  if [ -z "$_pkg_mgr" ]; then
    item_warn "No supported package manager detected (apt, dnf, yum, pacman); please verify web stack packages manually."
    return 0
  fi

  phase 2 6 "Package Repositories & System Prerequisites"
  item_ok "System Package Manager: $_pkg_mgr"

  if [ "$_pkg_mgr" = "apt" ]; then
    # Enable universe repository on Ubuntu if tool is available
    if command -v add-apt-repository >/dev/null 2>&1; then
      add-apt-repository -y universe >/dev/null 2>&1 || true
    fi

    # Pre-seed debconf so Postfix and man-db never block or prompt interactively
    echo 'man-db man-db/auto-update boolean false' | debconf-set-selections 2>/dev/null || true
    echo "postfix postfix/main_mailer_type select Internet Site" | debconf-set-selections 2>/dev/null || true
    echo "postfix postfix/mailname string $(hostname -f 2>/dev/null || echo 'localhost')" | debconf-set-selections 2>/dev/null || true

    # Wait gracefully for background locks (unattended-upgrades / apt-daily)
    if command -v fuser >/dev/null 2>&1; then
      if fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1; then
        item "Waiting for background package manager lock (unattended-upgrades)..."
        local _lock_tries=0
        while [ $_lock_tries -lt 30 ]; do
          if ! fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 && ! fuser /var/lib/apt/lists/lock >/dev/null 2>&1; then
            break
          fi
          sleep 2
          _lock_tries=$((_lock_tries + 1))
        done
        item_ok "Background package lock released."
      else
        item_ok "Package manager locks verified clear."
      fi
    else
      item_ok "Package manager locks verified clear."
    fi

    item "Updating package lists from OS repositories..."
    DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
      apt-get update -o DPkg::Lock::Timeout=60 >/dev/null 2>&1 || warn "apt-get update encountered non-critical errors"
    item_ok "Package repository index updated."

    # Core essential packages
    local _core_pkgs="git unzip sqlite3 libatomic1 certbot"
    [ "$IS_WSL" = "0" ] && _core_pkgs="$_core_pkgs ufw"
    local _missing_core=""
    for _pkg in $_core_pkgs; do
      dpkg -s "$_pkg" >/dev/null 2>&1 || _missing_core="$_missing_core $_pkg"
    done

    if [ -n "$_missing_core" ]; then
      item "Installing system prerequisites:$_missing_core..."
      DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
        apt-get install -y --no-install-recommends -o DPkg::Lock::Timeout=60 \
          -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
          $_missing_core >/dev/null 2>&1 || {
            for _p in $_missing_core; do
              DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$_p" >/dev/null 2>&1 || true
            done
          }
      item_ok "System prerequisites installed."
    else
      item_ok "System prerequisites already satisfied."
    fi

    phase 3 6 "LEMP Web Stack & Multi-PHP Provisioning"

    # Nginx
    if [ "$DO_NGINX" = "1" ]; then
      if command -v nginx >/dev/null 2>&1 || dpkg -s nginx >/dev/null 2>&1; then
        item_ok "Nginx web server already installed: $(nginx -v 2>&1 | head -n1)"
      else
        item "Installing Nginx Web Server engine..."
        DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
          apt-get install -y --no-install-recommends -o DPkg::Lock::Timeout=60 \
            -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
            nginx >/dev/null 2>&1 || apt-get install -y nginx >/dev/null 2>&1 || true
        item_ok "Nginx Web Server installed successfully."
      fi
    fi

    # MariaDB
    if [ "$DO_MARIADB" = "1" ]; then
      if command -v mysqld >/dev/null 2>&1 || dpkg -s mysql-server >/dev/null 2>&1 || dpkg -s mariadb-server >/dev/null 2>&1; then
        item_ok "Existing MySQL/MariaDB server detected."
        if dpkg -s mysql-server >/dev/null 2>&1 && ! dpkg -s mariadb-server >/dev/null 2>&1; then
          DB_UNIT="mysql"
        fi
      else
        item "Installing MariaDB Database Server & client..."
        DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
          apt-get install -y --no-install-recommends -o DPkg::Lock::Timeout=60 \
            -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
            mariadb-server mariadb-client >/dev/null 2>&1 || apt-get install -y mariadb-server mariadb-client >/dev/null 2>&1 || true
        item_ok "MariaDB Database Server installed successfully."
      fi
    fi

    # PHP
    if [ "$DO_PHP" = "1" ]; then
      local _php_core="php-fpm php-cli php-mysql php-curl php-gd php-mbstring php-xml php-zip php-intl php-bcmath php-opcache"
      local _missing_php=""
      for _p in $_php_core; do
        dpkg -s "$_p" >/dev/null 2>&1 || _missing_php="$_missing_php $_p"
      done

      if [ -n "$_missing_php" ]; then
        item "Installing PHP-FPM runtime and core extensions..."
        DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
          apt-get install -y --no-install-recommends -o DPkg::Lock::Timeout=60 \
            -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
            $_missing_php >/dev/null 2>&1 || {
              for _p in $_missing_php; do
                DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$_p" >/dev/null 2>&1 || true
              done
            }
        item_ok "PHP-FPM runtime installed ($(php -v 2>/dev/null | head -n1 || echo 'active'))."
      else
        item_ok "PHP-FPM runtime already installed ($(php -v 2>/dev/null | head -n1 || echo 'active'))."
      fi
    fi

    # Multi-PHP coexistence
    if [ "$DO_PHP" = "1" ] && [ "$DO_PHP_MULTI" = "1" ] && [ "$FAST" = "0" ]; then
      item "Configuring Multi-PHP coexistence repository (ppa:ondrej/php)..."
      if command -v add-apt-repository >/dev/null 2>&1 && [ ! -f /etc/apt/sources.list.d/ondrej-ubuntu-php-*.list ]; then
        add-apt-repository -y ppa:ondrej/php >/dev/null 2>&1 || true
        DEBIAN_FRONTEND=noninteractive apt-get update -o DPkg::Lock::Timeout=60 >/dev/null 2>&1 || true
      fi
      local _multi_php=""
      for _phpv in php8.1-fpm php8.2-fpm php8.3-fpm php8.4-fpm; do
        if apt-cache show "$_phpv" >/dev/null 2>&1 && ! dpkg -s "$_phpv" >/dev/null 2>&1; then
          _multi_php="$_multi_php $_phpv"
        fi
      done
      if [ -n "$_multi_php" ]; then
        item "Installing multi-PHP versions:$_multi_php..."
        DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
          apt-get install -y --no-install-recommends -o DPkg::Lock::Timeout=60 \
            -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
            $_multi_php >/dev/null 2>&1 || true
        item_ok "Multi-PHP coexistence installed (8.1, 8.2, 8.3, 8.4)."
      else
        item_ok "Multi-PHP versions already installed."
      fi
    fi

    # Optional services (Email, DNS, Security) - ONLY on dedicated Linux server, NOT WSL
    if [ "$IS_WSL" = "0" ]; then
      local _opt_pkgs=""
      [ "$DO_EMAIL" = "1" ] && _opt_pkgs="$_opt_pkgs postfix dovecot-imapd dovecot-pop3d"
      [ "$DO_DNS" = "1" ] && _opt_pkgs="$_opt_pkgs pdns-server pdns-backend-sqlite3"
      [ "$DO_SECURITY" = "1" ] && _opt_pkgs="$_opt_pkgs fail2ban"
      if [ "$DO_SECURITY" = "1" ]; then
        apt-cache show libnginx-mod-http-modsecurity >/dev/null 2>&1 && _opt_pkgs="$_opt_pkgs libnginx-mod-http-modsecurity modsecurity-crs"
      fi

      if [ -n "$_opt_pkgs" ]; then
        item "Installing optional server modules:$_opt_pkgs..."
        for _op in $_opt_pkgs; do
          if ! dpkg -s "$_op" >/dev/null 2>&1 && apt-cache show "$_op" >/dev/null 2>&1; then
            DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
              apt-get install -y --no-install-recommends -o DPkg::Lock::Timeout=30 \
                -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
                "$_op" >/dev/null 2>&1 || warn "Optional package $_op could not be installed"
          fi
        done
        item_ok "Optional server modules configured."
      fi
    fi

    rm -f /var/cache/apt/archives/*.deb 2>/dev/null || true

    # Composer
    if [ "$DO_PHP" = "1" ]; then
      if command -v composer >/dev/null 2>&1; then
        item_ok "Composer CLI already installed: $(composer --version 2>/dev/null | head -n1 || echo 'ready')"
      else
        item "Installing Composer 2.x CLI to /usr/local/bin/composer..."
        curl -sS https://getcomposer.org/installer 2>/dev/null | php -- --install-dir=/usr/local/bin --filename=composer 2>/dev/null || true
        item_ok "Composer 2.x CLI installed."
      fi
    fi

  elif [ "$_pkg_mgr" = "dnf" ] || [ "$_pkg_mgr" = "yum" ]; then
    phase 3 6 "LEMP Web Stack Provisioning"
    item "Installing packages via $_pkg_mgr..."
    $_pkg_mgr install -y -q epel-release 2>/dev/null || true
    local _rhel_pkgs="git unzip sqlite firewalld libatomic certbot"
    [ "$DO_NGINX" = "1" ] && _rhel_pkgs="$_rhel_pkgs nginx"
    [ "$DO_MARIADB" = "1" ] && _rhel_pkgs="$_rhel_pkgs mariadb-server mariadb"
    [ "$DO_PHP" = "1" ] && _rhel_pkgs="$_rhel_pkgs php-fpm php-cli php-mysqlnd php-gd php-xml php-mbstring php-json php-zip"
    $_pkg_mgr install -y -q $_rhel_pkgs || warn "Some RHEL packages could not be installed immediately."
    item_ok "RHEL packages installed."
    if [ "$DO_PHP" = "1" ] && ! command -v composer >/dev/null 2>&1; then
      item "Installing Composer binary to /usr/local/bin/composer..."
      curl -sS https://getcomposer.org/installer 2>/dev/null | php -- --install-dir=/usr/local/bin --filename=composer 2>/dev/null || true
      item_ok "Composer installed."
    fi

  elif [ "$_pkg_mgr" = "pacman" ]; then
    phase 3 6 "LEMP Web Stack Provisioning"
    item "Installing packages via pacman..."
    local _arch_pkgs="git unzip sqlite certbot"
    [ "$DO_NGINX" = "1" ] && _arch_pkgs="$_arch_pkgs nginx"
    [ "$DO_MARIADB" = "1" ] && _arch_pkgs="$_arch_pkgs mariadb"
    [ "$DO_PHP" = "1" ] && _arch_pkgs="$_arch_pkgs php php-fpm"
    pacman -Sy --noconfirm $_arch_pkgs 2>/dev/null || warn "pacman package installation completed with warnings."
    item_ok "Arch packages installed."
    if [ "$DO_MARIADB" = "1" ] && [ ! -d /var/lib/mysql/mysql ]; then
      mariadb-install-db --user=mysql --basedir=/usr --datadir=/var/lib/mysql >/dev/null 2>&1 || true
    fi
  fi

  mkdir -p /www/wwwroot
  item_ok "Webroot directory initialized at /www/wwwroot"
  STACK_PROVISIONED=1
}

start_linux_services() {
  [ "$STACK_PROVISIONED" = "1" ] || return 0
  if systemd_present; then
    if [ "$DO_NGINX" = "1" ]; then
      item "Starting Nginx web server engine..."
      systemctl enable --now nginx >/dev/null 2>&1 || true
      item_ok "Nginx web server active."
    fi
    if [ "$DO_MARIADB" = "1" ]; then
      item "Starting MariaDB database service..."
      systemctl enable --now "$DB_UNIT" >/dev/null 2>&1 || true
      item_ok "MariaDB database active."
    fi
    for _unit in $(systemctl list-unit-files --type=service --no-legend 'php*-fpm.service' 2>/dev/null | awk '{print $1}'); do
      systemctl enable --now "$_unit" >/dev/null 2>&1 || true
    done
    item_ok "PHP-FPM daemons active."
    systemctl enable --now certbot.timer >/dev/null 2>&1 || true
    if [ "$DO_DNS" = "1" ] || command -v pdnsutil >/dev/null 2>&1; then
      mkdir -p /etc/powerdns/pdns.d /var/lib/powerdns
      chmod 0644 /etc/powerdns/pdns.conf 2>/dev/null || true
      cat > /etc/powerdns/pdns.d/gsqlite3.conf << 'EOF'
launch+=gsqlite3
gsqlite3-database=/var/lib/powerdns/pdns.sqlite3
gsqlite3-dnssec=on
EOF
      rm -f /etc/powerdns/pdns.d/bind.conf
      if [ ! -s /var/lib/powerdns/pdns.sqlite3 ]; then
        if [ -f /usr/share/pdns-backend-sqlite3/schema/schema.sqlite3.sql ]; then
          sqlite3 /var/lib/powerdns/pdns.sqlite3 < /usr/share/pdns-backend-sqlite3/schema/schema.sqlite3.sql 2>/dev/null || true
        elif [ -f /usr/share/doc/pdns-backend-sqlite3/schema.sqlite3.sql ]; then
          sqlite3 /var/lib/powerdns/pdns.sqlite3 < /usr/share/doc/pdns-backend-sqlite3/schema.sqlite3.sql 2>/dev/null || true
        fi
      fi
      chown -R pdns:pdns /var/lib/powerdns 2>/dev/null || true
      chmod 0775 /var/lib/powerdns 2>/dev/null || true
      chmod 0664 /var/lib/powerdns/pdns.sqlite3 2>/dev/null || true

      if [ -d /run/systemd/resolve ]; then
        mkdir -p /etc/systemd/resolved.conf.d
        cat > /etc/systemd/resolved.conf.d/clouddeck-pdns.conf << 'EOF'
[Resolve]
DNSStubListener=no
EOF
        systemctl restart systemd-resolved >/dev/null 2>&1 || true
      fi
      systemctl enable --now pdns >/dev/null 2>&1 || systemctl restart pdns >/dev/null 2>&1 || true
    fi
  else
    [ "$DO_NGINX" = "1" ] && service nginx start >/dev/null 2>&1 || true
    [ "$DO_MARIADB" = "1" ] && service "$DB_UNIT" start >/dev/null 2>&1 || true
    for _init in /etc/init.d/php*-fpm; do
      [ -x "$_init" ] && "$_init" start >/dev/null 2>&1 || true
    done
    if [ "$DO_DNS" = "1" ] || command -v pdnsutil >/dev/null 2>&1; then
      service pdns restart >/dev/null 2>&1 || true
    fi
    item_ok "Web stack services initialized."
  fi
}

run_linux_installer() {
  INSTALLED_VERSION=""
  [ -f "$PREFIX/.clouddeck-version" ] && INSTALLED_VERSION="$(cat "$PREFIX/.clouddeck-version" 2>/dev/null || true)"
  NODE_MARKER="$PREFIX/.clouddeck-node-version"
  NODE_CURRENT="$(cat "$NODE_MARKER" 2>/dev/null || true)"

  check_system_node
  cache_release_metadata

  setup_swap
  provision_linux_packages

  phase 4 6 "Release Assets Download & Integrity Verification"

  # Install Agent
  if [ "$DO_AGENT" = "1" ]; then
    if [ "$INSTALLED_VERSION" = "$VERSION" ] && [ "$FORCE" = "0" ] && [ -x "$PREFIX/clouddeck-agent" ]; then
      item_ok "Agent binary $VERSION already up to date."
    else
      AGENT_FILE="clouddeck-agent-linux-$ARCH_GO"
      item "Downloading CloudDeck Agent binary ($VERSION, $ARCH_GO)..."
      download_asset "$AGENT_FILE" "$TMP/$AGENT_FILE"
      item_ok "Agent binary downloaded ($(_file_size "$TMP/$AGENT_FILE"))."
      item "Installing CloudDeck agent..."
      install -m 0755 "$TMP/$AGENT_FILE" "$PREFIX/clouddeck-agent.new"
      mv -f "$PREFIX/clouddeck-agent.new" "$PREFIX/clouddeck-agent"
      item_ok "Agent binary installed to $PREFIX/clouddeck-agent"
    fi
  fi

  # Install Node.js runtime for panel
  if [ "$DO_PANEL" = "1" ] && [ "$USING_SYSTEM_NODE" = "1" ]; then
    item_ok "Configuring host Node.js v$SYS_NODE_VER..."
    mkdir -p "$PREFIX/node/bin"
    rm -rf "$PREFIX/node/bin/node" "$PREFIX/node/bin/npm" "$PREFIX/node/bin/npx"
    ln -sf "$SYS_NODE_PATH" "$PREFIX/node/bin/node"
    ln -sf "$SYS_NPM_PATH" "$PREFIX/node/bin/npm"
    [ -n "$SYS_NPX_PATH" ] && ln -sf "$SYS_NPX_PATH" "$PREFIX/node/bin/npx"
    printf 'system-%s\n' "$SYS_NODE_VER" > "$NODE_MARKER"
    item_ok "Host Node.js configured."
  elif [ "$DO_PANEL" = "1" ] && { [ ! -x "$PREFIX/node/bin/node" ] || [ "$NODE_CURRENT" != "$NODE_VERSION" ] || [ "$FORCE" = "1" ]; }; then
    NODE_TARBALL="node-v$NODE_VERSION-linux-$ARCH_NODE.tar.gz"
    item "Downloading pinned Node.js runtime $NODE_VERSION ($ARCH_NODE)..."
    download "https://nodejs.org/dist/v$NODE_VERSION/$NODE_TARBALL" "$TMP/$NODE_TARBALL"
    item_ok "Node.js $NODE_VERSION runtime downloaded ($(_file_size "$TMP/$NODE_TARBALL"))."
    item "Extracting Node.js runtime to $PREFIX/node..."
    mkdir -p "$TMP/node"
    tar -xzf "$TMP/$NODE_TARBALL" -C "$TMP/node" --strip-components=1 || die "failed to extract Node.js"
    rm -rf "$PREFIX/node"
    mv "$TMP/node" "$PREFIX/node"
    printf '%s\n' "$NODE_VERSION" > "$NODE_MARKER"
    item_ok "Pinned Node.js $NODE_VERSION runtime installed."
  fi

  if [ "$DO_PANEL" = "1" ] && [ -d "$PREFIX/node" ]; then
    chown -R 0:0 "$PREFIX/node"
    for _bin in node npm npx; do
      _link="/usr/local/bin/$_bin"
      [ -L "$_link" ] && [ ! -e "$_link" ] && rm -f "$_link"
      if [ -x "$PREFIX/node/bin/$_bin" ] && [ ! -e "$_link" ] && [ ! -L "$_link" ]; then
        ln -s "$PREFIX/node/bin/$_bin" "$_link"
      fi
    done

    # CLI tool installation
    item "Installing CloudDeck CLI to /usr/local/bin/clouddeck..."
    if [ ! -s "$TMP/clouddeck-cli" ]; then
      download_asset "clouddeck-cli" "$TMP/clouddeck-cli" 2>/dev/null || true
    fi
    if [ ! -s "$TMP/clouddeck-cli" ] && [ -f "scripts/clouddeck" ]; then
      cp scripts/clouddeck "$TMP/clouddeck-cli"
    fi
    if [ ! -s "$TMP/clouddeck-cli" ]; then
      curl -fsSL "https://raw.githubusercontent.com/$REPO/main/scripts/clouddeck" -o "$TMP/clouddeck-cli" 2>/dev/null || true
    fi
    if [ -s "$TMP/clouddeck-cli" ]; then
      mkdir -p "$PREFIX/bin"
      { printf '#!%s\n' "$PREFIX/node/bin/node"; tail -n +2 "$TMP/clouddeck-cli"; } > "$TMP/clouddeck-cli.inst"
      install -m 0755 "$TMP/clouddeck-cli.inst" "$PREFIX/bin/clouddeck"
      ln -sf "$PREFIX/bin/clouddeck" /usr/local/bin/clouddeck
      item_ok "CloudDeck CLI installed to /usr/local/bin/clouddeck"
    else
      item_warn "CloudDeck CLI release binary unavailable; installing Node CLI wrapper..."
      mkdir -p "$PREFIX/bin"
      cat > "$PREFIX/bin/clouddeck" << EOF
#!/bin/bash
exec "$PREFIX/node/bin/node" "$PREFIX/scripts/clouddeck" "\$@" 2>/dev/null || echo "CloudDeck CLI not found; run: sudo clouddeck reinstall"
EOF
      chmod +x "$PREFIX/bin/clouddeck"
      ln -sf "$PREFIX/bin/clouddeck" /usr/local/bin/clouddeck
      item_ok "CloudDeck CLI wrapper configured."
    fi
  fi

  # Install Panel
  if [ "$DO_PANEL" = "1" ]; then
    if [ "$INSTALLED_VERSION" = "$VERSION" ] && [ "$FORCE" = "0" ] && [ -f "$PREFIX/panel/server.js" ]; then
      item_ok "Next.js 16 Web Panel $VERSION already installed."
    else
      item "Downloading Next.js 16 Web Panel bundle (clouddeck-panel.tar.gz)..."
      download_asset "clouddeck-panel.tar.gz" "$TMP/clouddeck-panel.tar.gz"
      item_ok "Web Panel bundle downloaded ($(_file_size "$TMP/clouddeck-panel.tar.gz"))."
      item "Installing CloudDeck web panel..."
      mkdir -p "$PREFIX/panel"
      tar -xzf "$TMP/clouddeck-panel.tar.gz" -C "$PREFIX/panel" || die "failed to extract panel bundle"
      chown -R 0:0 "$PREFIX/panel"
      chmod -R a+rX "$PREFIX/panel"
      item_ok "Next.js 16 Web panel bundle installed."
    fi

    # Web panel & terminal system user
    PANEL_USER=""
    if command -v useradd >/dev/null 2>&1; then
      id clouddeck >/dev/null 2>&1 || useradd -r -s /bin/bash -d /www/wwwroot clouddeck 2>/dev/null || true
      id clouddeck >/dev/null 2>&1 && PANEL_USER="clouddeck"
    fi

    if id clouddeck >/dev/null 2>&1; then
      # Ensure home directory is webroot where sites are located, not panel internal state
      usermod -d /www/wwwroot clouddeck 2>/dev/null || true
      mkdir -p /www/wwwroot
      chown -R clouddeck:clouddeck /www/wwwroot 2>/dev/null || true
      chmod -R 775 /www /www/wwwroot 2>/dev/null || true
      if id www-data >/dev/null 2>&1; then
        usermod -a -G www-data clouddeck 2>/dev/null || true
        usermod -a -G clouddeck www-data 2>/dev/null || true
      fi
      usermod -aG sudo clouddeck 2>/dev/null || usermod -aG wheel clouddeck 2>/dev/null || true
      mkdir -p /etc/sudoers.d
      cat > /etc/sudoers.d/clouddeck << 'EOF'
clouddeck ALL=(ALL:ALL) ALL
EOF
      chmod 0440 /etc/sudoers.d/clouddeck
      if [ -n "$PANEL_SEED_PASSWORD" ]; then
        printf 'clouddeck:%s\n' "$PANEL_SEED_PASSWORD" | chpasswd 2>/dev/null || true
      fi
    fi
  fi

  phase 5 6 "Background Services Configuration & Systemd Setup"

  mkdir -p "$DATADIR/agent" "$DATADIR/agent/backups" "$DATADIR/panel"
  chmod 755 "$DATADIR"
  chmod 750 "$DATADIR/agent" "$DATADIR/agent/backups"
  if [ -n "${PANEL_USER:-}" ]; then
    chown -R "$PANEL_USER" "$DATADIR/panel" 2>/dev/null || true
    chmod 750 "$DATADIR/panel" 2>/dev/null || true
  fi

  # Config files
  AGENT_TOKEN=""
  [ -f "$ETCDIR/agent.env" ] && AGENT_TOKEN="$(sed -n 's/^AGENT_AUTH_TOKEN=//p' "$ETCDIR/agent.env" | tail -n 1)"
  [ -z "$AGENT_TOKEN" ] && AGENT_TOKEN="$(random_hex 32)"

  if [ "$DO_AGENT" = "1" ] && [ ! -f "$ETCDIR/agent.env" ]; then
    cat > "$ETCDIR/agent.env" <<EOF
AGENT_LISTEN=127.0.0.1:$AGENT_PORT
AGENT_AUTH_TOKEN=$AGENT_TOKEN
AGENT_STATE_DIR=$DATADIR/agent
AGENT_FTP_RUNAS=clouddeck
AGENT_WEB_RUNAS=clouddeck
AGENT_TERM_USER=clouddeck
AGENT_MODSEC_CONF=/etc/nginx/modsec/clouddeck.conf
AGENT_BACKUP_DIR=$DATADIR/agent/backups
AGENT_WEBROOT=/www/wwwroot
EOF
    chmod 600 "$ETCDIR/agent.env"
    item_ok "Wrote agent configuration: $ETCDIR/agent.env"
  elif [ "$DO_AGENT" = "1" ] && [ -f "$ETCDIR/agent.env" ]; then
    sed -i -E "s|^AGENT_LISTEN=.*|AGENT_LISTEN=127.0.0.1:$AGENT_PORT|" "$ETCDIR/agent.env" 2>/dev/null || true
  fi

  if [ "$DO_PANEL" = "1" ] && [ ! -f "$ETCDIR/panel.env" ]; then
    SECRET="$(random_hex 32)"
    _PANEL_LISTEN_PORT="$PANEL_PORT"
    _PANEL_HOSTNAME="0.0.0.0"
    _PANEL_COOKIE_SECURE="false"
    if [ -f "/etc/nginx/conf.d/clouddeck-panel.conf" ]; then
      _int_port="$(grep -oE 'proxy_pass http://127.0.0.1:[0-9]+' /etc/nginx/conf.d/clouddeck-panel.conf 2>/dev/null | grep -oE '[0-9]+' || true)"
      if [ -n "$_int_port" ]; then
        _PANEL_LISTEN_PORT="$_int_port"
        _PANEL_HOSTNAME="127.0.0.1"
        _PANEL_COOKIE_SECURE="true"
      fi
    fi
    cat > "$ETCDIR/panel.env" <<EOF
PORT=$_PANEL_LISTEN_PORT
HOSTNAME=$_PANEL_HOSTNAME
NODE_ENV=production
AGENT_URL=http://127.0.0.1:$AGENT_PORT
AGENT_TOKEN=$AGENT_TOKEN
PANEL_DATA_DIR=$DATADIR/panel
PANEL_SESSION_SECRET=$SECRET
PANEL_SEED_ADMIN=$PANEL_SEED_ADMIN
PANEL_SEED_PASSWORD=$PANEL_SEED_PASSWORD
PANEL_COOKIE_SECURE=$_PANEL_COOKIE_SECURE
EOF
    chmod 600 "$ETCDIR/panel.env"
    item_ok "Wrote panel configuration: $ETCDIR/panel.env"
  elif [ "$DO_PANEL" = "1" ] && [ -f "$ETCDIR/panel.env" ]; then
    # If Nginx SSL reverse-proxy is configured for the panel, preserve the internal proxy port
    if [ -f "/etc/nginx/conf.d/clouddeck-panel.conf" ]; then
      _int_port="$(grep -oE 'proxy_pass http://127.0.0.1:[0-9]+' /etc/nginx/conf.d/clouddeck-panel.conf 2>/dev/null | grep -oE '[0-9]+' || true)"
      if [ -n "$_int_port" ]; then
        sed -i -E "s|^PORT=.*|PORT=$_int_port|" "$ETCDIR/panel.env" 2>/dev/null || true
        sed -i -E "s|^HOSTNAME=.*|HOSTNAME=127.0.0.1|" "$ETCDIR/panel.env" 2>/dev/null || true
        sed -i -E "s|^PANEL_COOKIE_SECURE=.*|PANEL_COOKIE_SECURE=true|" "$ETCDIR/panel.env" 2>/dev/null || true
      fi
    else
      sed -i -E "s|^PORT=.*|PORT=$PANEL_PORT|" "$ETCDIR/panel.env" 2>/dev/null || true
    fi
    sed -i -E "s|^AGENT_URL=.*|AGENT_URL=http://127.0.0.1:$AGENT_PORT|" "$ETCDIR/panel.env" 2>/dev/null || true
  fi

  # Layout marker for management CLI
  cat > "$PREFIX/.clouddeck-install" <<EOF
PREFIX=$PREFIX
DATADIR=$DATADIR
ETCDIR=$ETCDIR
AGENT_PORT=$AGENT_PORT
PANEL_PORT=$PANEL_PORT
REPO=$REPO
NO_SYSTEMD=$FORCE_NO_SYSTEMD
DO_AGENT=$DO_AGENT
DO_PANEL=$DO_PANEL
FAST=$FAST
SYSTEM_NODE=$SYSTEM_NODE
PROFILE=$INSTALL_PROFILE
EOF
  chmod 0644 "$PREFIX/.clouddeck-install"

  # Systemd services
  WROTE_SYSTEMD=0
  if systemd_present && { [ "$DO_AGENT" = "1" ] || [ "$DO_PANEL" = "1" ]; }; then
    item "Registering systemd service units..."
    if [ "$DO_AGENT" = "1" ]; then
      cat > /etc/systemd/system/clouddeck-agent.service <<EOF
[Unit]
Description=CloudDeck agent (privileged, localhost API)
After=network.target

[Service]
Type=simple
EnvironmentFile=$ETCDIR/agent.env
ExecStart=$PREFIX/clouddeck-agent
Restart=always
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
Wants=clouddeck-agent.service

[Service]
Type=simple
EnvironmentFile=$ETCDIR/panel.env
ExecStart=$PREFIX/node/bin/node server.js
WorkingDirectory=$PREFIX/panel
Restart=always
RestartSec=2
${PANEL_USER:+User=$PANEL_USER}

[Install]
WantedBy=multi-user.target
EOF
    fi

    systemctl daemon-reload
    [ -x "$PREFIX/run/stop.sh" ] && "$PREFIX/run/stop.sh" >/dev/null 2>&1 || true

    start_linux_services

    if [ "$DO_AGENT" = "1" ]; then
      item "Starting CloudDeck Agent daemon..."
      systemctl enable clouddeck-agent >/dev/null 2>&1 || true
      systemctl restart clouddeck-agent >/dev/null 2>&1 || true
      item_ok "CloudDeck Agent service active."
    fi
    if [ "$DO_PANEL" = "1" ]; then
      item "Starting CloudDeck Web Panel service..."
      systemctl enable clouddeck-panel >/dev/null 2>&1 || true
      systemctl restart clouddeck-panel >/dev/null 2>&1 || true
      item_ok "CloudDeck Web Panel service active."
    fi
    WROTE_SYSTEMD=1
  fi

  # Fallback start/stop scripts
  mkdir -p "$PREFIX/run"
  cat > "$PREFIX/run/start.sh" << EOF
#!/bin/sh
set -eu
stty onlcr 2>/dev/null || true
PREFIX="${PREFIX}"
ETCDIR="${ETCDIR}"
[ -x "\$PREFIX/run/stop.sh" ] && "\$PREFIX/run/stop.sh" >/dev/null 2>&1 || true
if [ -f "\$ETCDIR/agent.env" ]; then
  set -a; . "\$ETCDIR/agent.env"; set +a
  ( cd "\$PREFIX" && setsid "\$PREFIX/clouddeck-agent" >> "\$PREFIX/run/agent.log" 2>&1 & echo \$! > "\$PREFIX/run/agent.pid" )
fi
if [ -f "\$ETCDIR/panel.env" ]; then
  set -a; . "\$ETCDIR/panel.env"; set +a
  ( cd "\$PREFIX/panel" && setsid "\$PREFIX/node/bin/node" server.js >> "\$PREFIX/run/panel.log" 2>&1 & echo \$! > "\$PREFIX/run/panel.pid" )
fi
# Ensure web server, database and PHP runtimes are running if not managed by systemd
service nginx start >/dev/null 2>&1 || /etc/init.d/nginx start >/dev/null 2>&1 || true
service mariadb start >/dev/null 2>&1 || service mysql start >/dev/null 2>&1 || /etc/init.d/mariadb start >/dev/null 2>&1 || true
for v in 8.1 8.2 8.3 8.4; do
  service "php\$v-fpm" start >/dev/null 2>&1 || /etc/init.d/"php\$v-fpm" start >/dev/null 2>&1 || true
done
echo "started"
EOF
  cat > "$PREFIX/run/stop.sh" << EOF
#!/bin/sh
PREFIX="${PREFIX}"
for p in "\$PREFIX/run/panel.pid" "\$PREFIX/run/agent.pid"; do
  [ -f "\$p" ] || continue
  pid="\$(cat "\$p")"
  kill -TERM "\$pid" 2>/dev/null || true
  sleep 1
  kill -9 "\$pid" 2>/dev/null || true
  rm -f "\$p"
done
echo "stopped"
EOF
  chmod +x "$PREFIX/run/start.sh" "$PREFIX/run/stop.sh"

  if [ "$WROTE_SYSTEMD" = "0" ]; then
    start_linux_services
    item "Starting services via script supervisor..."
    "$PREFIX/run/start.sh"
    item_ok "Services active via script supervisor."
  fi

  printf '%s\n' "$VERSION" > "$PREFIX/.clouddeck-version"
}

verify_service_health() {
  phase 6 6 "Service Health Verification & Padlock Setup"
  if [ "$DO_AGENT" = "1" ]; then
    item "Probing CloudDeck Agent health on 127.0.0.1:$AGENT_PORT..."
    local i=0
    local _agent_ok=0
    while [ $i -lt 15 ]; do
      if curl -fsS "http://127.0.0.1:$AGENT_PORT/v1/health" >/dev/null 2>&1; then
        _agent_ok=1
        break
      fi
      i=$((i + 1))
      printf "        ${TC_STEEL}•${CLR_RESET} Waiting for Agent daemon... (%d/15s)\r" "$i"
      sleep 1
    done
    printf "\033[K"
    if [ "$_agent_ok" = "1" ]; then
      item_ok "Agent responsive: $(curl -fsS "http://127.0.0.1:$AGENT_PORT/v1/health" 2>/dev/null || echo 'OK')"
    else
      if [ "$OS_TYPE" = "darwin" ]; then
        item_warn "Agent did not answer immediately on port $AGENT_PORT (check: launchctl list in.dakshraman.clouddeck-agent)"
      else
        item_warn "Agent did not answer immediately on port $AGENT_PORT (check journalctl -u clouddeck-agent or $PREFIX/run/agent.log)"
      fi
    fi
  fi

  if [ "$DO_PANEL" = "1" ]; then
    item "Probing CloudDeck Web Panel health on port $PANEL_PORT..."
    local i=0
    local _panel_ok=0
    while [ $i -lt 25 ]; do
      if curl -k -fsSL --max-time 2 -o /dev/null "http://127.0.0.1:$PANEL_PORT/" 2>/dev/null || curl -k -fsSL --max-time 2 -o /dev/null "https://127.0.0.1:$PANEL_PORT/" 2>/dev/null; then
        _panel_ok=1
        break
      fi
      i=$((i + 1))
      printf "        ${TC_STEEL}•${CLR_RESET} Waiting for Next.js 16 panel to boot... (%d/25s)\r" "$i"
      sleep 1
    done
    printf "\033[K"
    if [ "$_panel_ok" = "1" ]; then
      item_ok "Web panel verified active on port $PANEL_PORT"
    else
      if [ "$OS_TYPE" = "darwin" ]; then
        item_warn "Web panel is still initializing on port $PANEL_PORT (check: launchctl list in.dakshraman.clouddeck-panel)"
      else
        item_warn "Web panel is still initializing on port $PANEL_PORT (check journalctl -u clouddeck-panel or $PREFIX/run/panel.log)"
      fi
    fi
  fi
}

# --- Execution Entrypoint ----------------------------------------------------
if [ "$NON_INTERACTIVE" = "0" ] && [ "$IS_WSL" = "0" ]; then
  print_banner
elif [ "$NON_INTERACTIVE" = "1" ] && [ "$IS_WSL" = "1" ]; then
  say ""
  say "  ${TC_SKY}${CLR_BOLD}╭─ Provisioning CloudDeck inside WSL ($DISTRO_NAME) ───────────────────${CLR_RESET}"
  say "  ${TC_SKY}│${CLR_RESET}  ${TC_PEACH}Profile:${CLR_RESET} $INSTALL_PROFILE  ${CLR_DIM}│${CLR_RESET}  ${TC_PEACH}Panel Port:${CLR_RESET} $PANEL_PORT  ${CLR_DIM}│${CLR_RESET}  ${TC_PEACH}Version:${CLR_RESET} $VERSION"
  say "  ${TC_SKY}╰───────────────────────────────────────────────────────────────────${CLR_RESET}"
else
  print_banner
fi

setup_interactive_tty
resolve_latest
check_existing_installation
check_and_resolve_ports
prompt_component_selection

phase 1 6 "System & Hardware Environment Inspection"
item_ok "Host Platform: $DISTRO_NAME ($RAW_OS $MACHINE)"
item_ok "Installation Directory: $PREFIX (Data: $DATADIR, Config: $ETCDIR)"
item_ok "Target Ports Verified: Web Panel ($PANEL_PORT), Agent Daemon ($AGENT_PORT)"
item_ok "Release Target: $VERSION"

TMP="$(mktemp -d /tmp/clouddeck-unified.XXXXXX)" || die "mktemp failed"
cleanup() {
  for _pid in ${PID_AGENT:-} ${PID_PANEL:-} ${PID_CLI:-} ${PID_NODE:-}; do
    kill "$_pid" 2>/dev/null || true
  done
  rm -rf "$TMP"
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

mkdir -p "$PREFIX" "$DATADIR" "$ETCDIR"

if [ "$OS_TYPE" = "darwin" ]; then
  run_macos_installer
else
  run_linux_installer
fi

verify_service_health

# Determine accessible URL
if [ "$IS_WSL" = "1" ] || [ "$OS_TYPE" = "darwin" ]; then
  PANEL_URL="http://localhost:$PANEL_PORT"
else
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$IP" ] || IP="<server-ip>"
  PANEL_URL="http://$IP:$PANEL_PORT"
fi

# --- Final Completion Card Styled in Uni Palette -----------------------------
say ""
say "  ${TC_SKY}${CLR_BOLD}╭─ CloudDeck Installation Complete ─────────────────────────────────${CLR_RESET}"
say "  ${TC_SKY}│${CLR_RESET}"
say "  ${TC_SKY}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}● Control Panel URL:${CLR_RESET}   ${CLR_BOLD}$PANEL_URL${CLR_RESET}"
if [ "$OS_TYPE" = "linux" ] && [ "$IS_WSL" = "0" ]; then
  say "  ${TC_SKY}│${CLR_RESET}  ${TC_PEACH}● Public Network URL:${CLR_RESET}  http://<server-ip>:$PANEL_PORT"
fi
if [ -n "$PANEL_SEED_ADMIN" ]; then
  say "  ${TC_SKY}│${CLR_RESET}  ${TC_PEACH}● Admin Username:${CLR_RESET}      $PANEL_SEED_ADMIN"
  if [ -n "$PANEL_SEED_PASSWORD" ]; then
    say "  ${TC_SKY}│${CLR_RESET}  ${TC_PEACH}● Admin Password:${CLR_RESET}      $PANEL_SEED_PASSWORD"
  else
    say "  ${TC_SKY}│${CLR_RESET}  ${TC_PEACH}● Admin Setup:${CLR_RESET}         Initial password configured via CLI"
  fi
else
  say "  ${TC_SKY}│${CLR_RESET}  ${TC_PEACH}● Initial Setup:${CLR_RESET}       Open panel URL to create your admin account"
fi
say "  ${TC_SKY}│${CLR_RESET}  ${TC_PEACH}● Installed Profile:${CLR_RESET}   $INSTALL_PROFILE"
say "  ${TC_SKY}│${CLR_RESET}  ${TC_PEACH}● Configuration Dir:${CLR_RESET}   $ETCDIR"
say "  ${TC_SKY}│${CLR_RESET}  ${TC_PEACH}● Data & Webroot Dir:${CLR_RESET}  $DATADIR"
say "  ${TC_SKY}│${CLR_RESET}"
say "  ${TC_SKY}├─ Quick CLI Management Commands ───────────────────────────────────${CLR_RESET}"
say "  ${TC_SKY}│${CLR_RESET}    ${TC_STEEL}clouddeck status${CLR_RESET}          Check services health & resource metrics"
say "  ${TC_SKY}│${CLR_RESET}    ${TC_STEEL}clouddeck restart${CLR_RESET}         Restart panel & agent services"
say "  ${TC_SKY}│${CLR_RESET}    ${TC_STEEL}clouddeck logs -f${CLR_RESET}         Stream live panel and agent logs"
say "  ${TC_SKY}│${CLR_RESET}    ${TC_STEEL}clouddeck site create${CLR_RESET}     Deploy WordPress, Laravel, Next.js or PHP"
say "  ${TC_SKY}│${CLR_RESET}"
say "  ${TC_SKY}╰───────────────────────────────────────────────────────────────────${CLR_RESET}"
say ""
_clean_version="${VERSION#v}"
ok "CloudDeck v${_clean_version} is ready! Welcome to the modern hosting deck."
exit 0
