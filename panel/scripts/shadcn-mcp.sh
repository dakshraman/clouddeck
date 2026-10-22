#!/usr/bin/env bash
# Launches the shadcn MCP server for this project from WSL.
set -euo pipefail
cd "$(dirname "$0")/.."
exec npx -y shadcn@latest mcp
