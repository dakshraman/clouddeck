#!/usr/bin/env bash
# Deterministic tests for the destructive-safe portions of install.sh.
#
# These tests never download releases or touch the host's normal CloudDeck
# paths. They exercise argument validation and uninstall/purge boundaries in
# isolated temporary directories.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALLER="$ROOT/scripts/install.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

help="$(sh "$INSTALLER" --help)"
printf '%s\n' "$help" | grep -q -- '--uninstall'
printf '%s\n' "$help" | grep -q -- '--no-systemd'
printf '%s\n' "$help" | grep -q -- '--fast'
printf '%s\n' "$help" | grep -q -- '--minimal'
printf '%s\n' "$help" | grep -q -- '--system-node'

if [[ "${EUID}" -ne 0 ]]; then
  echo "installer lifecycle tests require root; argument/syntax checks passed"
  exit 0
fi

PREFIX="$TMP/prefix"
DATA="$TMP/data"
ETC="$TMP/etc"

if sh "$INSTALLER" --prefix "$TMP/with space" --uninstall >/dev/null 2>&1; then
  echo "expected whitespace path validation to fail" >&2
  exit 1
fi

mkdir -p "$PREFIX" "$DATA/panel" "$DATA/agent" "$ETC"
printf '#!/bin/sh\nexit 0\n' > "$PREFIX/clouddeck-agent"
chmod 0755 "$PREFIX/clouddeck-agent"
touch "$ETC/agent.env" "$ETC/panel.env"
printf 'sentinel\n' > "$DATA/panel/sentinel"
sh "$INSTALLER" --prefix "$PREFIX" --datadir "$DATA" --etcdir "$ETC" --uninstall >/dev/null

[ ! -e "$PREFIX" ]
[ -e "$DATA/panel/sentinel" ]
[ -e "$ETC/agent.env" ]

mkdir -p "$PREFIX" "$DATA/panel" "$DATA/agent" "$ETC"
printf '#!/bin/sh\nexit 0\n' > "$PREFIX/clouddeck-agent"
chmod 0755 "$PREFIX/clouddeck-agent"
touch "$ETC/agent.env" "$ETC/panel.env"
sh "$INSTALLER" --prefix "$PREFIX" --datadir "$DATA" --etcdir "$ETC" --uninstall --purge >/dev/null

[ ! -e "$PREFIX" ]
[ ! -e "$DATA" ]
[ ! -e "$ETC" ]

echo "installer lifecycle tests passed"
