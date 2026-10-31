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
say()   { printf '%b\n' "$*"; }
step()  { printf "  ${TC_SKY}${CLR_BOLD}❯${CLR_RESET} %b\n" "$*"; }
ok()    { printf "  ${CLR_GREEN}${CLR_BOLD}✔${CLR_RESET} %b\n" "$*"; }
info()  { printf "  ${TC_STEEL}${CLR_BOLD}ℹ${CLR_RESET} %b\n" "$*"; }
warn()  { printf "  ${CLR_YELLOW}${CLR_BOLD}▲${CLR_RESET} %b\n" "$*" >&2; }
die()   { printf "  ${CLR_RED}${CLR_BOLD}✖ [ERROR]${CLR_RESET} %b\n" "$*" >&2; exit 1; }

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
  command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]
}

random_hex() {
  od -An -N "$1" -tx1 /dev/urandom | tr -d ' \n'
}

download_url() {
  _url="$1"; _out="$2"; shift 2
  _tries=0
  while [ $_tries -lt 3 ]; do
    if curl -fsSL -C - --connect-timeout 15 --retry 2 "$@" -o "$_out" "$_url"; then
      return 0
    fi
    _tries=$((_tries + 1))
    warn "download stalled or failed; retrying ($_tries/3)..."
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
      VERSION="v0.6.36"
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
  if (exec 6<>/dev/tcp/127.0.0.1/"$_p") 2>/dev/null; then
    exec 6<&- 6>&-
    return 0
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

check_and_resolve_ports() {
  # 1. Resolve PANEL_PORT if busy
  if is_port_in_use "$PANEL_PORT"; then
    local _fallback_panel
    _fallback_panel="$(find_next_free_port "$((PANEL_PORT + 1))")"
    warn "Web Panel port ${PANEL_PORT} is currently in use by another service."
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

  # 2. Resolve AGENT_PORT if busy
  if is_port_in_use "$AGENT_PORT"; then
    local _fallback_agent
    _fallback_agent="$(find_next_free_port "$((AGENT_PORT + 1))")"
    warn "Agent Daemon port ${AGENT_PORT} is currently in use by another service."
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
  # If non-interactive flag was explicitly passed or no tty attached, apply profile and return
  if [ "$NON_INTERACTIVE" = "1" ] || [ "$HAS_TTY" = "0" ]; then
    case "$INSTALL_PROFILE" in
      fast)
        DO_EMAIL=0; DO_DNS=0; DO_SECURITY=0; DO_PHP_MULTI=0
        ;;
      minimal)
        DO_NGINX=0; DO_MARIADB=0; DO_PHP=0; DO_EMAIL=0; DO_DNS=0; DO_SECURITY=0
        ;;
      *)
        if [ "$OS_TYPE" = "linux" ]; then
          DO_EMAIL=1; DO_DNS=1; DO_SECURITY=1; DO_PHP_MULTI=1
        fi
        ;;
    esac
    return 0
  fi

  render_system_card
  say "  ${TC_STEEL}├─ Choose Installation Profile ─────────────────────────────────────${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}  ${TC_PEACH}${CLR_BOLD}● [1] Recommended Full LEMP Stack${CLR_RESET} ${TC_SKY}(Default)${CLR_RESET}"
  say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Next.js 15 Panel, Go Daemon & CloudDeck CLI${CLR_RESET}"
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
  say "  ${TC_STEEL}│${CLR_RESET}        ${CLR_DIM}• Next.js 15 Panel, Go Daemon & CloudDeck CLI${CLR_RESET}"
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
  fi

  # Create directories
  mkdir -p "$PREFIX/bin" "$PREFIX/panel" "$DATADIR/agent" "$DATADIR/panel" "$ETCDIR" "$PREFIX/run"

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
  if [ -s "$TMP/clouddeck-cli" ]; then
    chmod +x "$TMP/clouddeck-cli"
    mv -f "$TMP/clouddeck-cli" "$PREFIX/bin/clouddeck-cli"
  elif [ -f "scripts/clouddeck" ]; then
    cp scripts/clouddeck "$PREFIX/bin/clouddeck-cli"
    chmod +x "$PREFIX/bin/clouddeck-cli"
  fi

  # Wrapper script in PATH
  cat > "$PREFIX/bin/clouddeck" << 'EOF'
#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
exec node "$DIR/clouddeck-cli" "$@"
EOF
  chmod +x "$PREFIX/bin/clouddeck"
  if [ -w "/usr/local/bin" ]; then
    ln -sf "$PREFIX/bin/clouddeck" /usr/local/bin/clouddeck
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
        <key>AGENT_PORT</key>
        <string>$AGENT_PORT</string>
        <key>AGENT_DATA_DIR</key>
        <string>$DATADIR/agent</string>
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

  cat > "$LAUNCH_DIR/in.dakshraman.clouddeck-panel.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>in.dakshraman.clouddeck-panel</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(command -v node)</string>
        <string>$PREFIX/panel/server.js</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>$PANEL_PORT</string>
        <key>PANEL_DATA_DIR</key>
        <string>$DATADIR/panel</string>
        <key>AGENT_URL</key>
        <string>http://127.0.0.1:$AGENT_PORT</string>
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
  launchctl load "$LAUNCH_DIR/in.dakshraman.clouddeck-agent.plist" 2>/dev/null || true
  launchctl load "$LAUNCH_DIR/in.dakshraman.clouddeck-panel.plist" 2>/dev/null || true

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
      step "Low memory detected (${_ram_kb} kB). Creating 1GB swapfile..."
      fallocate -l 1G /swapfile_clouddeck 2>/dev/null || dd if=/dev/zero of=/swapfile_clouddeck bs=1M count=1024 2>/dev/null
      chmod 600 /swapfile_clouddeck
      mkswap /swapfile_clouddeck >/dev/null 2>&1 || true
      swapon /swapfile_clouddeck >/dev/null 2>&1 || true
      ok "Swap activated."
    fi
  fi
}

provision_linux_packages() {
  [ "$INSTALL_PROFILE" = "minimal" ] && return 0
  if ! command -v apt-get >/dev/null 2>&1; then
    warn "apt-get not found: please install web stack packages (nginx, php-fpm, mariadb) manually"
    return 0
  fi

  step "Provisioning Linux server stack packages..."
  _pkgs="git unzip sqlite3 ufw libatomic1"
  [ "$DO_NGINX" = "1" ] && _pkgs="$_pkgs nginx"
  
  if [ "$DO_PHP" = "1" ]; then
    _pkgs="$_pkgs php-fpm php-cli php-mysql php-curl php-gd php-mbstring php-xml php-zip php-intl php-bcmath php-opcache"
    if [ "$DO_PHP_MULTI" = "1" ] && [ "$FAST" = "0" ]; then
      # If sury repository is present or can be enabled, multi-php packages are available
      _pkgs="$_pkgs php8.1-fpm php8.2-fpm php8.3-fpm php8.4-fpm"
    fi
  fi

  if [ "$DO_MARIADB" = "1" ]; then
    if command -v mysqld >/dev/null 2>&1 || dpkg -s mysql-server >/dev/null 2>&1 || dpkg -s mariadb-server >/dev/null 2>&1; then
      ok "Existing MySQL/MariaDB server detected; leaving it in place."
      if dpkg -s mysql-server >/dev/null 2>&1 && ! dpkg -s mariadb-server >/dev/null 2>&1; then
        DB_UNIT="mysql"
      fi
    else
      _pkgs="$_pkgs mariadb-server mariadb-client"
    fi
  fi

  if [ "$DO_EMAIL" = "1" ]; then
    _pkgs="$_pkgs postfix dovecot-imapd dovecot-pop3d"
  fi

  if [ "$DO_DNS" = "1" ]; then
    _pkgs="$_pkgs pdns-server pdns-backend-sqlite3"
  fi

  if [ "$DO_SECURITY" = "1" ]; then
    _pkgs="$_pkgs libnginx-mod-http-modsecurity modsecurity-crs fail2ban"
  fi

  # certbot for SSL
  if ! command -v certbot >/dev/null 2>&1 && ! dpkg -s certbot >/dev/null 2>&1; then
    _pkgs="$_pkgs certbot"
  fi

  # Filter missing packages
  _missing=""
  for _pkg in $_pkgs; do
    dpkg -s "$_pkg" >/dev/null 2>&1 || _missing="$_missing $_pkg"
  done

  if [ -z "$_missing" ]; then
    ok "All selected hosting packages are already installed."
  else
    step "Installing missing packages:$_missing"
    echo 'man-db man-db/auto-update boolean false' | debconf-set-selections 2>/dev/null || true
    DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
      apt-get update -qq -o DPkg::Lock::Timeout=300 || warn "apt-get update encountered non-critical errors"
    # shellcheck disable=SC2086
    DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a \
      apt-get install -y --no-install-recommends -o DPkg::Lock::Timeout=300 \
        -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
        $_missing || warn "Some optional packages could not be installed immediately."
    rm -f /var/cache/apt/archives/*.deb 2>/dev/null || true
    ok "Package installation step completed."
  fi

  mkdir -p /www/wwwroot
  STACK_PROVISIONED=1
}

start_linux_services() {
  [ "$STACK_PROVISIONED" = "1" ] || return 0
  step "Starting web and database services..."
  if systemd_present; then
    [ "$DO_NGINX" = "1" ] && systemctl enable --now nginx >/dev/null 2>&1 || true
    [ "$DO_MARIADB" = "1" ] && systemctl enable --now "$DB_UNIT" >/dev/null 2>&1 || true
    for _unit in $(systemctl list-unit-files --type=service --no-legend 'php*-fpm.service' 2>/dev/null | awk '{print $1}'); do
      systemctl enable --now "$_unit" >/dev/null 2>&1 || true
    done
    systemctl enable --now certbot.timer >/dev/null 2>&1 || true
  else
    [ "$DO_NGINX" = "1" ] && service nginx start >/dev/null 2>&1 || true
    [ "$DO_MARIADB" = "1" ] && service "$DB_UNIT" start >/dev/null 2>&1 || true
    for _init in /etc/init.d/php*-fpm; do
      [ -x "$_init" ] && "$_init" start >/dev/null 2>&1 || true
    done
  fi
  ok "Hosting stack services active."
}

run_linux_installer() {
  INSTALLED_VERSION=""
  [ -f "$PREFIX/.clouddeck-version" ] && INSTALLED_VERSION="$(cat "$PREFIX/.clouddeck-version" 2>/dev/null || true)"
  NODE_MARKER="$PREFIX/.clouddeck-node-version"
  NODE_CURRENT="$(cat "$NODE_MARKER" 2>/dev/null || true)"

  check_system_node
  cache_release_metadata

  # Concurrent background asset downloads
  _bg_started=0
  if [ "$DO_AGENT" = "1" ] && { [ "$INSTALLED_VERSION" != "$VERSION" ] || [ "$FORCE" = "1" ] || [ ! -x "$PREFIX/clouddeck-agent" ]; }; then
    AGENT_FILE="clouddeck-agent-linux-$ARCH_GO"
    ( download_asset "$AGENT_FILE" "$TMP/$AGENT_FILE" ) >"$TMP/dl-agent.log" 2>&1 &
    PID_AGENT=$!
    _bg_started=1
  fi

  if [ "$DO_PANEL" = "1" ] && { [ "$INSTALLED_VERSION" != "$VERSION" ] || [ "$FORCE" = "1" ] || [ ! -f "$PREFIX/panel/server.js" ]; }; then
    ( download_asset "clouddeck-panel.tar.gz" "$TMP/clouddeck-panel.tar.gz" ) >"$TMP/dl-panel.log" 2>&1 &
    PID_PANEL=$!
    _bg_started=1
  fi

  if [ "$DO_CLI" = "1" ] && { [ "$INSTALLED_VERSION" != "$VERSION" ] || [ "$FORCE" = "1" ] || [ ! -x "$PREFIX/bin/clouddeck" ]; }; then
    ( download_asset "clouddeck-cli" "$TMP/clouddeck-cli" ) >"$TMP/dl-cli.log" 2>&1 &
    PID_CLI=$!
    _bg_started=1
  fi

  if [ "$DO_PANEL" = "1" ] && [ "$USING_SYSTEM_NODE" = "0" ] && { [ ! -x "$PREFIX/node/bin/node" ] || [ "$NODE_CURRENT" != "$NODE_VERSION" ] || [ "$FORCE" = "1" ]; }; then
    NODE_TARBALL="node-v$NODE_VERSION-linux-$ARCH_NODE.tar.gz"
    (
      download "https://nodejs.org/dist/v$NODE_VERSION/$NODE_TARBALL" "$TMP/$NODE_TARBALL"
      if command -v sha256sum >/dev/null 2>&1; then
        download "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" "$TMP/SHASUMS256.txt"
      fi
    ) >"$TMP/dl-node.log" 2>&1 &
    PID_NODE=$!
    _bg_started=1
  fi

  if [ "$_bg_started" = "1" ]; then
    step "Downloading release assets in background..."
  fi

  setup_swap
  provision_linux_packages
  start_linux_services

  # Install Agent
  if [ "$DO_AGENT" = "1" ]; then
    if [ "$INSTALLED_VERSION" = "$VERSION" ] && [ "$FORCE" = "0" ] && [ -x "$PREFIX/clouddeck-agent" ]; then
      ok "Agent $VERSION already up to date."
    else
      AGENT_FILE="clouddeck-agent-linux-$ARCH_GO"
      [ -n "$PID_AGENT" ] && wait "$PID_AGENT" 2>/dev/null || true
      if [ ! -s "$TMP/$AGENT_FILE" ]; then
        step "Downloading agent binary..."
        download_asset "$AGENT_FILE" "$TMP/$AGENT_FILE"
      fi
      step "Installing CloudDeck agent..."
      install -m 0755 "$TMP/$AGENT_FILE" "$PREFIX/clouddeck-agent.new"
      mv -f "$PREFIX/clouddeck-agent.new" "$PREFIX/clouddeck-agent"
      ok "Agent binary installed to $PREFIX/clouddeck-agent"
    fi
  fi

  # Install Node.js runtime for panel
  if [ "$DO_PANEL" = "1" ] && [ "$USING_SYSTEM_NODE" = "1" ]; then
    step "Configuring host Node.js v$SYS_NODE_VER..."
    mkdir -p "$PREFIX/node/bin"
    rm -rf "$PREFIX/node/bin/node" "$PREFIX/node/bin/npm" "$PREFIX/node/bin/npx"
    ln -sf "$SYS_NODE_PATH" "$PREFIX/node/bin/node"
    ln -sf "$SYS_NPM_PATH" "$PREFIX/node/bin/npm"
    [ -n "$SYS_NPX_PATH" ] && ln -sf "$SYS_NPX_PATH" "$PREFIX/node/bin/npx"
    printf 'system-%s\n' "$SYS_NODE_VER" > "$NODE_MARKER"
  elif [ "$DO_PANEL" = "1" ] && { [ ! -x "$PREFIX/node/bin/node" ] || [ "$NODE_CURRENT" != "$NODE_VERSION" ] || [ "$FORCE" = "1" ]; }; then
    NODE_TARBALL="node-v$NODE_VERSION-linux-$ARCH_NODE.tar.gz"
    [ -n "$PID_NODE" ] && wait "$PID_NODE" 2>/dev/null || true
    if [ ! -s "$TMP/$NODE_TARBALL" ]; then
      step "Downloading pinned Node.js runtime $NODE_VERSION..."
      download "https://nodejs.org/dist/v$NODE_VERSION/$NODE_TARBALL" "$TMP/$NODE_TARBALL"
    fi
    mkdir -p "$TMP/node"
    tar -xzf "$TMP/$NODE_TARBALL" -C "$TMP/node" --strip-components=1 || die "failed to extract Node.js"
    rm -rf "$PREFIX/node"
    mv "$TMP/node" "$PREFIX/node"
    printf '%s\n' "$NODE_VERSION" > "$NODE_MARKER"
    ok "Pinned Node.js $NODE_VERSION runtime installed."
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
    [ -n "$PID_CLI" ] && wait "$PID_CLI" 2>/dev/null || true
    if [ ! -s "$TMP/clouddeck-cli" ]; then
      download_asset "clouddeck-cli" "$TMP/clouddeck-cli" || true
    fi
    if [ -s "$TMP/clouddeck-cli" ]; then
      mkdir -p "$PREFIX/bin"
      { printf '#!%s\n' "$PREFIX/node/bin/node"; tail -n +2 "$TMP/clouddeck-cli"; } > "$TMP/clouddeck-cli.inst"
      install -m 0755 "$TMP/clouddeck-cli.inst" "$PREFIX/bin/clouddeck"
      ln -sf "$PREFIX/bin/clouddeck" /usr/local/bin/clouddeck
      ok "CloudDeck CLI installed to /usr/local/bin/clouddeck"
    fi
  fi

  # Install Panel
  if [ "$DO_PANEL" = "1" ]; then
    if [ "$INSTALLED_VERSION" = "$VERSION" ] && [ "$FORCE" = "0" ] && [ -f "$PREFIX/panel/server.js" ]; then
      ok "Panel $VERSION already installed."
    else
      [ -n "$PID_PANEL" ] && wait "$PID_PANEL" 2>/dev/null || true
      if [ ! -s "$TMP/clouddeck-panel.tar.gz" ]; then
        step "Downloading CloudDeck panel bundle..."
        download_asset "clouddeck-panel.tar.gz" "$TMP/clouddeck-panel.tar.gz"
      fi
      step "Installing CloudDeck web panel..."
      mkdir -p "$PREFIX/panel"
      tar -xzf "$TMP/clouddeck-panel.tar.gz" -C "$PREFIX/panel" || die "failed to extract panel bundle"
      chown -R 0:0 "$PREFIX/panel"
      chmod -R a+rX "$PREFIX/panel"
      ok "Web panel bundle installed."
    fi

    # Unprivileged user for the web panel
    PANEL_USER=""
    if command -v useradd >/dev/null 2>&1; then
      id clouddeck >/dev/null 2>&1 || useradd -r -s /bin/bash -d "$DATADIR/panel" clouddeck 2>/dev/null || true
      id clouddeck >/dev/null 2>&1 && PANEL_USER="clouddeck"
    fi

    if id clouddeck >/dev/null 2>&1; then
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
EOF
    chmod 600 "$ETCDIR/agent.env"
    ok "Wrote agent configuration: $ETCDIR/agent.env"
  elif [ "$DO_AGENT" = "1" ] && [ -f "$ETCDIR/agent.env" ]; then
    sed -i -E "s|^AGENT_LISTEN=.*|AGENT_LISTEN=127.0.0.1:$AGENT_PORT|" "$ETCDIR/agent.env" 2>/dev/null || true
  fi

  if [ "$DO_PANEL" = "1" ] && [ ! -f "$ETCDIR/panel.env" ]; then
    SECRET="$(random_hex 32)"
    cat > "$ETCDIR/panel.env" <<EOF
PORT=$PANEL_PORT
HOSTNAME=0.0.0.0
NODE_ENV=production
AGENT_URL=http://127.0.0.1:$AGENT_PORT
AGENT_TOKEN=$AGENT_TOKEN
PANEL_DATA_DIR=$DATADIR/panel
PANEL_SESSION_SECRET=$SECRET
PANEL_SEED_ADMIN=$PANEL_SEED_ADMIN
PANEL_SEED_PASSWORD=$PANEL_SEED_PASSWORD
PANEL_COOKIE_SECURE=false
EOF
    chmod 600 "$ETCDIR/panel.env"
    ok "Wrote panel configuration: $ETCDIR/panel.env"
  elif [ "$DO_PANEL" = "1" ] && [ -f "$ETCDIR/panel.env" ]; then
    sed -i -E "s|^PORT=.*|PORT=$PANEL_PORT|" "$ETCDIR/panel.env" 2>/dev/null || true
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
    step "Configuring and starting systemd services..."
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

    if [ "$DO_AGENT" = "1" ]; then
      systemctl enable clouddeck-agent >/dev/null 2>&1 || true
      systemctl restart clouddeck-agent >/dev/null 2>&1 || true
    fi
    if [ "$DO_PANEL" = "1" ]; then
      systemctl enable clouddeck-panel >/dev/null 2>&1 || true
      systemctl restart clouddeck-panel >/dev/null 2>&1 || true
    fi
    WROTE_SYSTEMD=1
    ok "Systemd units enabled and started."
  fi

  # Fallback start/stop scripts
  mkdir -p "$PREFIX/run"
  cat > "$PREFIX/run/start.sh" << 'EOF'
#!/bin/sh
set -eu
[ -x "$PREFIX/run/stop.sh" ] && "$PREFIX/run/stop.sh" >/dev/null 2>&1 || true
if [ -f "$ETCDIR/agent.env" ]; then
  set -a; . "$ETCDIR/agent.env"; set +a
  ( cd "$PREFIX" && setsid "$PREFIX/clouddeck-agent" >> "$PREFIX/run/agent.log" 2>&1 & echo $! > "$PREFIX/run/agent.pid" )
fi
if [ -f "$ETCDIR/panel.env" ]; then
  set -a; . "$ETCDIR/panel.env"; set +a
  ( cd "$PREFIX/panel" && setsid "$PREFIX/node/bin/node" server.js >> "$PREFIX/run/panel.log" 2>&1 & echo $! > "$PREFIX/run/panel.pid" )
fi
echo "started"
EOF
  cat > "$PREFIX/run/stop.sh" << 'EOF'
#!/bin/sh
for p in "$PREFIX/run/panel.pid" "$PREFIX/run/agent.pid"; do
  [ -f "$p" ] || continue
  pid="$(cat "$p")"
  kill -TERM "$pid" 2>/dev/null || true
  sleep 1
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$p"
done
echo "stopped"
EOF
  chmod +x "$PREFIX/run/start.sh" "$PREFIX/run/stop.sh"

  if [ "$WROTE_SYSTEMD" = "0" ]; then
    step "Starting services via script supervisor..."
    "$PREFIX/run/start.sh"
  fi

  # Service health verification
  if [ "$DO_AGENT" = "1" ]; then
    step "Verifying CloudDeck Agent health on 127.0.0.1:$AGENT_PORT..."
    i=0
    while [ $i -lt 15 ]; do
      if curl -fsS "http://127.0.0.1:$AGENT_PORT/v1/health" >/dev/null 2>&1; then break; fi
      i=$((i + 1)); sleep 1
    done
    if curl -fsS "http://127.0.0.1:$AGENT_PORT/v1/health" >/dev/null 2>&1; then
      ok "Agent responsive: $(curl -fsS "http://127.0.0.1:$AGENT_PORT/v1/health")"
    else
      warn "Agent did not answer immediately on port $AGENT_PORT (check journalctl -u clouddeck-agent)"
    fi
  fi

  if [ "$DO_PANEL" = "1" ]; then
    step "Verifying CloudDeck Web Panel health on port $PANEL_PORT..."
    i=0
    while [ $i -lt 25 ]; do
      if curl -fsSL --max-time 2 -o /dev/null "http://127.0.0.1:$PANEL_PORT/" 2>/dev/null; then break; fi
      i=$((i + 1)); sleep 1
    done
    if curl -fsSL --max-time 2 -o /dev/null "http://127.0.0.1:$PANEL_PORT/"; then
      ok "Web panel verified active on port $PANEL_PORT"
    else
      warn "Web panel is still initializing on port $PANEL_PORT (check journalctl -u clouddeck-panel)"
    fi
  fi

  printf '%s\n' "$VERSION" > "$PREFIX/.clouddeck-version"
}

# --- Execution Entrypoint ----------------------------------------------------
print_banner
setup_interactive_tty
resolve_latest
check_and_resolve_ports
prompt_component_selection

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
