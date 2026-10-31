#!/bin/bash
# CloudDeck macOS Local Development Suite Installer
#
# This script delegates to the Unified CloudDeck Installer, which automatically
# detects macOS (Apple Silicon or Intel), presents the interactive Uni-themed
# component selector, and provisions Homebrew, LEMP services, LaunchAgents,
# and Local Root CA Trust in Keychain.
#
# Direct Universal Command:
#   curl -fsSL https://clouddeck.dakshraman.in/install.sh | bash

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"

if [ -n "$DIR" ] && [ -f "$DIR/install.sh" ]; then
  exec "$DIR/install.sh" "$@"
fi

INSTALLER_URL="https://clouddeck.dakshraman.in/install.sh"
if ! curl -fsSL -I "$INSTALLER_URL" >/dev/null 2>&1; then
  INSTALLER_URL="https://raw.githubusercontent.com/dakshraman/clouddeck/main/scripts/install.sh"
fi

exec bash -c "$(curl -fsSL "$INSTALLER_URL")" -- "$@"
