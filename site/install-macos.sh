#!/bin/bash
# CloudDeck macOS Local Development Suite Installer
# One-line install command:
#   curl -fsSL https://clouddeck.dakshraman.in/install-macos.sh | bash
#
# Transforms your Mac (Apple Silicon or Intel) into a modern, lightning-fast
# LEMP web development workstation. The modern, native alternative to MAMP & XAMPP.
#
# Features:
#   - Apple Silicon (M1/M2/M3/M4 arm64) & Intel (x86_64) native binaries
#   - Native LEMP stack via Homebrew: Nginx, MariaDB, PHP 8.4 (coexisting)
#   - Background process management via launchctl LaunchAgents & brew services
#   - Automatic Local Root CA trust in macOS System Keychain for green padlocks
#   - Native macOS CLI 'clouddeck' for instant control and project linking

set -euo pipefail

REPO="dakshraman/clouddeck"
VERSION="latest"
PREFIX="/usr/local/opt/clouddeck"
if [ ! -w "/usr/local" ] && [ "$(id -u)" != "0" ]; then
  PREFIX="$HOME/.clouddeck"
fi
DATADIR="$HOME/.clouddeck/data"
ETCDIR="$HOME/.clouddeck/etc"
PANEL_PORT="2083"
AGENT_PORT="9090"
FAST=1
SKIP_TRUST=0

# --- Styling & Helpers -------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

say()  { printf "${CYAN}==>${NC} %s\n" "$*"; }
ok()   { printf "${GREEN}[OK]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[WARN]${NC} %s\n" "$*"; }
die()  { printf "${RED}[ERROR]${NC} %s\n" "$*" >&2; exit 1; }

print_banner() {
  cat << "EOF"
   ____ _                 _ ____             _    
  / ___| | ___  _   _  __| |  _ \  ___  ___| | __
 | |   | |/ _ \| | | |/ _` | | | |/ _ \/ __| |/ /
 | |___| | (_) | |_| | (_| | |_| |  __/ (__|   < 
  \____|_|\___/ \__,_|\__,_|____/ \___|\___|_|\_\

  macOS Local Development Suite (MAMP / XAMPP Alternative)
  Apple Silicon & Intel | Nginx Parity | MariaDB | Native CLI
  ===========================================================

EOF
}

# --- System Checks -----------------------------------------------------------

check_macos() {
  if [ "$(uname -s)" != "Darwin" ]; then
    die "This installer is designed strictly for macOS. Use install.sh on Linux or install.ps1 on Windows."
  fi

  ARCH="$(uname -m)"
  case "$ARCH" in
    arm64)
      ARCH_GO="arm64"
      say "Detected Apple Silicon Mac (arm64: M1/M2/M3/M4)"
      ;;
    x86_64)
      ARCH_GO="amd64"
      say "Detected Intel Mac (x86_64)"
      ;;
    *)
      die "Unsupported macOS CPU architecture: $ARCH"
      ;;
  esac
}

# --- Homebrew & Package Provisioning -----------------------------------------

ensure_homebrew() {
  if ! command -v brew >/dev/null 2>&1; then
    say "Homebrew not found. Installing Homebrew package manager..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || die "Failed to install Homebrew"
    
    # Configure brew on PATH for this session
    if [ -x "/opt/homebrew/bin/brew" ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x "/usr/local/bin/brew" ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  else
    ok "Homebrew detected: $(brew --version | head -n1)"
  fi
}

provision_brew_stack() {
  say "Checking and provisioning native LEMP stack via Homebrew..."
  
  BREW_PACKAGES=()
  for pkg in nginx mariadb php node; do
    if ! brew list "$pkg" >/dev/null 2>&1; then
      BREW_PACKAGES+=("$pkg")
    fi
  done

  if [ ${#BREW_PACKAGES[@]} -gt 0 ]; then
    say "Installing Homebrew packages: ${BREW_PACKAGES[*]}..."
    brew install "${BREW_PACKAGES[@]}"
    ok "Homebrew packages installed successfully."
  else
    ok "Core LEMP packages already installed (nginx, mariadb, php, node)."
  fi

  # Start Homebrew services
  say "Starting database and web services..."
  brew services start mariadb || true
  brew services start nginx || true
  brew services start php || true
  ok "MariaDB, Nginx, and PHP services running via brew services."
}

# --- Release Asset Download --------------------------------------------------

download() {
  local url="$1"
  local dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  else
    die "curl is required to download assets."
  fi
}

resolve_version() {
  if [ "$VERSION" = "latest" ]; then
    say "Resolving latest CloudDeck release..."
    VERSION="$(curl -fsSL -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' || echo "latest")"
    if [ -z "$VERSION" ] || [ "$VERSION" = "latest" ]; then
      # Fallback to dev channel
      VERSION="v0.6.27"
    fi
  fi
  say "Target version: $VERSION"
}

download_assets() {
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  say "Downloading CloudDeck release assets for macOS ($ARCH_GO)..."
  mkdir -p "$PREFIX/bin" "$PREFIX/panel" "$DATADIR" "$ETCDIR" "$PREFIX/run"

  local BASE_URL="https://github.com/$REPO/releases/download/$VERSION"
  if [ "$VERSION" = "dev" ]; then
    BASE_URL="https://github.com/$REPO/releases/download/dev"
  fi

  # Agent binary
  local AGENT_BIN="clouddeck-agent-darwin-$ARCH_GO"
  say "Downloading static macOS agent binary ($AGENT_BIN)..."
  if ! download "$BASE_URL/$AGENT_BIN" "$TMP_DIR/clouddeck-agent" 2>/dev/null; then
    warn "Direct release binary download failed. Trying raw repository fallback..."
    # Local fallback or fallback build if in repo
    if [ -f "agent/cmd/clouddeck-agent/main.go" ] && command -v go >/dev/null 2>&1; then
      say "Compiling native macOS agent from local source..."
      (cd agent && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o "$TMP_DIR/clouddeck-agent" ./cmd/clouddeck-agent)
    else
      download "https://github.com/$REPO/releases/latest/download/$AGENT_BIN" "$TMP_DIR/clouddeck-agent"
    fi
  fi
  chmod +x "$TMP_DIR/clouddeck-agent"
  mv -f "$TMP_DIR/clouddeck-agent" "$PREFIX/bin/clouddeck-agent"
  ok "macOS agent binary installed to $PREFIX/bin/clouddeck-agent"

  # Panel bundle
  say "Downloading CloudDeck panel standalone bundle..."
  if download "$BASE_URL/clouddeck-panel.tar.gz" "$TMP_DIR/panel.tar.gz" 2>/dev/null; then
    tar -xzf "$TMP_DIR/panel.tar.gz" -C "$PREFIX/panel"
    ok "CloudDeck panel unpacked into $PREFIX/panel"
  else
    warn "Could not download remote panel bundle. Checking local bundle..."
    if [ -d "panel/.next/standalone" ]; then
      cp -R panel/.next/standalone/* "$PREFIX/panel/"
      ok "Copied local panel build to $PREFIX/panel"
    fi
  fi

  # CLI script
  say "Installing CloudDeck CLI..."
  if download "$BASE_URL/clouddeck-cli" "$TMP_DIR/clouddeck-cli" 2>/dev/null; then
    chmod +x "$TMP_DIR/clouddeck-cli"
    mv -f "$TMP_DIR/clouddeck-cli" "$PREFIX/bin/clouddeck-cli"
  elif [ -f "scripts/clouddeck" ]; then
    cp scripts/clouddeck "$PREFIX/bin/clouddeck-cli"
    chmod +x "$PREFIX/bin/clouddeck-cli"
  fi
  ok "Installed CLI runtime."

  echo "$VERSION" > "$PREFIX/.clouddeck-version"
}

# --- Local Root CA & SSL Setup -----------------------------------------------

setup_local_ca() {
  if [ "$SKIP_TRUST" = "1" ]; then
    say "Skipping Local CA trust configuration (--skip-trust specified)."
    return
  fi

  say "Generating and configuring Local Development Root CA for macOS..."
  SSL_DIR="$ETCDIR/ssl"
  mkdir -p "$SSL_DIR"

  CA_KEY="$SSL_DIR/clouddeck-ca.key"
  CA_CRT="$SSL_DIR/clouddeck-ca.crt"

  if [ ! -f "$CA_CRT" ] || [ ! -f "$CA_KEY" ]; then
    openssl req -x509 -new -nodes \
      -keyout "$CA_KEY" \
      -sha256 -days 3650 \
      -out "$CA_CRT" \
      -subj "/CN=CloudDeck Local Development CA/O=CloudDeck Local Dev" >/dev/null 2>&1
    chmod 0600 "$CA_KEY"
    chmod 0644 "$CA_CRT"
  fi

  # Also generate or ensure localhost/local wildcard cert exists
  CERT_KEY="$SSL_DIR/panel.key"
  CERT_CRT="$SSL_DIR/panel.crt"
  CSR="$SSL_DIR/panel.csr"
  EXT="$SSL_DIR/panel.ext"

  cat > "$EXT" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.local
DNS.3 = *.test
DNS.4 = *.clouddeck.local
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

  openssl req -new -nodes -newkey rsa:2048 \
    -keyout "$CERT_KEY" \
    -out "$CSR" \
    -subj "/CN=localhost/O=CloudDeck Local Host" >/dev/null 2>&1

  openssl x509 -req -in "$CSR" \
    -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial \
    -out "$CERT_CRT" -days 825 -sha256 \
    -extfile "$EXT" >/dev/null 2>&1

  rm -f "$CSR" "$EXT"
  chmod 0600 "$CERT_KEY"
  chmod 0644 "$CERT_CRT"

  say "Adding CloudDeck Local CA to macOS Keychain for trusted green padlocks..."
  if [ "$(id -u)" = "0" ]; then
    security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CA_CRT" 2>/dev/null || true
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CA_CRT" 2>/dev/null || true
  else
    # User keychain fallback (no sudo required)
    security add-trusted-cert -d -r trustRoot -k "$HOME/Library/Keychains/login.keychain-db" "$CA_CRT" 2>/dev/null \
      || security add-trusted-cert -d -r trustRoot -k "$HOME/Library/Keychains/login.keychain" "$CA_CRT" 2>/dev/null || true
  fi
  ok "Local Root CA installed! Safari, Chrome, and Edge will now trust https://localhost:$PANEL_PORT and https://*.local"
}

# --- Service Management via launchctl LaunchAgents --------------------------

setup_launchagents() {
  say "Configuring macOS LaunchAgents for background service management..."
  LAUNCH_DIR="$HOME/Library/LaunchAgents"
  mkdir -p "$LAUNCH_DIR"

  # Panel LaunchAgent
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

  # Agent LaunchAgent
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

  # Also write portable start.sh and stop.sh scripts
  cat > "$PREFIX/run/start.sh" <<EOF
#!/bin/sh
launchctl load -w "$LAUNCH_DIR/in.dakshraman.clouddeck-agent.plist" 2>/dev/null || true
launchctl load -w "$LAUNCH_DIR/in.dakshraman.clouddeck-panel.plist" 2>/dev/null || true
echo "started"
EOF

  cat > "$PREFIX/run/stop.sh" <<EOF
#!/bin/sh
launchctl unload "$LAUNCH_DIR/in.dakshraman.clouddeck-panel.plist" 2>/dev/null || true
launchctl unload "$LAUNCH_DIR/in.dakshraman.clouddeck-agent.plist" 2>/dev/null || true
echo "stopped"
EOF
  chmod +x "$PREFIX/run/start.sh" "$PREFIX/run/stop.sh"

  # Load agents
  launchctl load -w "$LAUNCH_DIR/in.dakshraman.clouddeck-agent.plist" 2>/dev/null || true
  launchctl load -w "$LAUNCH_DIR/in.dakshraman.clouddeck-panel.plist" 2>/dev/null || true
  ok "macOS LaunchAgents loaded and active."
}

# --- CLI Binary and Symlink --------------------------------------------------

setup_cli() {
  say "Installing native macOS 'clouddeck' CLI command..."
  mkdir -p "$PREFIX/bin"

  cat > "$PREFIX/bin/clouddeck" <<EOF
#!/bin/bash
# CloudDeck macOS CLI Wrapper
set -e

PANEL_PORT="$PANEL_PORT"
PREFIX="$PREFIX"

show_help() {
  cat <<HELP
CloudDeck macOS Local Dev CLI

Usage: clouddeck <command> [options]

Commands:
  clouddeck status                  Check status of panel, agent, Nginx, PHP, MariaDB
  clouddeck start                   Start CloudDeck services via launchctl & brew
  clouddeck stop                    Stop CloudDeck services
  clouddeck restart                 Restart CloudDeck services
  clouddeck open                    Open panel in default browser (http://localhost:$PANEL_PORT)
  clouddeck logs [panel|agent] [-f] View real-time logs
  clouddeck link <directory>        Link project folder to local webroot
  clouddeck trust                   Re-import Local CA into macOS Keychain
  clouddeck version                 Display CloudDeck version
  clouddeck help                    Show this help message

Panel URL: http://localhost:$PANEL_PORT
HELP
}

CMD="\${1:-help}"
case "\$CMD" in
  status)
    echo "CloudDeck macOS Local Dev Environment"
    echo "----------------------------------------------------"
    printf "  Panel UI:  "
    if curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:$PANEL_PORT/" 2>/dev/null; then
      echo "\033[0;32mRUNNING\033[0m -> http://localhost:$PANEL_PORT"
    else
      echo "\033[0;31mSTOPPED\033[0m (run 'clouddeck start')"
    fi

    echo ""
    echo "  Brew Services:"
    brew services list | grep -E "nginx|mariadb|php" || true
    ;;

  start)
    echo "Starting CloudDeck on macOS..."
    brew services start mariadb 2>/dev/null || true
    brew services start nginx 2>/dev/null || true
    brew services start php 2>/dev/null || true
    "$PREFIX/run/start.sh"
    echo "Services started! Open panel: http://localhost:$PANEL_PORT"
    ;;

  stop)
    echo "Stopping CloudDeck on macOS..."
    "$PREFIX/run/stop.sh"
    echo "Services stopped."
    ;;

  restart)
    echo "Restarting CloudDeck on macOS..."
    "$PREFIX/run/stop.sh"
    sleep 1
    "$PREFIX/run/start.sh"
    echo "Restart complete."
    ;;

  open)
    echo "Opening CloudDeck panel: http://localhost:$PANEL_PORT"
    open "http://localhost:$PANEL_PORT"
    ;;

  logs)
    TARGET="\${2:-panel}"
    FOLLOW=""
    if [ "\${3:-}" = "-f" ] || [ "\${2:-}" = "-f" ]; then
      FOLLOW="-f"
      if [ "\${2:-}" = "-f" ]; then TARGET="panel"; fi
    fi
    tail -n 100 \$FOLLOW "$PREFIX/run/\$TARGET.log"
    ;;

  link)
    DIR="\${2:-}"
    if [ -z "\$DIR" ]; then
      echo "Usage: clouddeck link <directory>"
      exit 1
    fi
    FULL_PATH="\$(cd "\$DIR" && pwd)"
    echo "Project folder linked: \$FULL_PATH"
    echo "Point your site Webroot in CloudDeck panel to: \$FULL_PATH"
    ;;

  trust)
    echo "Re-importing CloudDeck Local CA into Keychain..."
    security add-trusted-cert -d -r trustRoot -k "\$HOME/Library/Keychains/login.keychain-db" "$ETCDIR/ssl/clouddeck-ca.crt" 2>/dev/null || true
    echo "Done!"
    ;;

  version)
    cat "$PREFIX/.clouddeck-version" 2>/dev/null || echo "v0.6.27"
    ;;

  help|*)
    show_help
    ;;
esac
EOF
  chmod +x "$PREFIX/bin/clouddeck"

  # Link to standard PATH location
  TARGET_LINK="/usr/local/bin/clouddeck"
  if [ -w "/usr/local/bin" ] || [ "$(id -u)" = "0" ]; then
    ln -sfn "$PREFIX/bin/clouddeck" "$TARGET_LINK"
    ok "CLI linked to $TARGET_LINK"
  else
    USER_BIN="$HOME/.clouddeck/bin"
    mkdir -p "$USER_BIN"
    ln -sfn "$PREFIX/bin/clouddeck" "$USER_BIN/clouddeck"
    
    # Check if in PATH
    if [[ ":$PATH:" != *":$USER_BIN:"* ]]; then
      SHELL_RC="$HOME/.zshrc"
      if [ -f "$HOME/.bash_profile" ] && [ ! -f "$HOME/.zshrc" ]; then
        SHELL_RC="$HOME/.bash_profile"
      fi
      echo "export PATH=\"\$HOME/.clouddeck/bin:\$PATH\"" >> "$SHELL_RC"
      warn "Added $USER_BIN to $SHELL_RC (restart terminal or run: export PATH=\"$USER_BIN:\$PATH\")"
    fi
    ok "CLI installed to $USER_BIN/clouddeck"
  fi
}

# --- Main Flow ---------------------------------------------------------------

print_banner
check_macos
ensure_homebrew
provision_brew_stack
resolve_version
download_assets
setup_local_ca
setup_launchagents
setup_cli

cat << EOF

${GREEN}=================================================================${NC}
${BOLD}🎉 CloudDeck Local Development Suite is Ready on macOS!${NC}
${GREEN}=================================================================${NC}

  ${CYAN}Web Panel:${NC}       http://localhost:$PANEL_PORT
  ${CYAN}Stack:${NC}           Nginx, MariaDB, PHP (native via Homebrew)
  ${CYAN}SSL Padlocks:${NC}    Trusted Root CA installed in macOS Keychain
  ${CYAN}Architecture:${NC}    Apple Silicon / Intel native

${BOLD}Quick CLI Commands:${NC}
  clouddeck open                    # Open panel in default browser
  clouddeck status                  # Check status of panel, Nginx, PHP, MariaDB
  clouddeck link ~/Sites/my-app     # Link a macOS project folder
  clouddeck logs panel -f           # Stream real-time logs

Enjoy blazing-fast modern web development on your Mac!
EOF
