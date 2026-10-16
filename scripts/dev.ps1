# CloudDeck Windows developer helpers.
#
# Run from anywhere; all paths resolve relative to this script's location.
#
# Usage:
#   .\scripts\dev.ps1 panel       Start the panel dev server (http://localhost:3000)
#   .\scripts\dev.ps1 agent-dry   Run the Go agent in dry-run mode
#   .\scripts\dev.ps1 typecheck   Typecheck the panel (tsc --noEmit)
#
# The panel expects an agent on http://127.0.0.1:9090 (see README.md).
# agent-dry requires Go 1.23+ on PATH and touches nothing on the system:
# rendered nginx configs go to agent/data/dryrun/.

param(
    [Parameter(Position = 0)]
    [string]$Task = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

switch ($Task) {
    "panel" {
        Push-Location (Join-Path $RepoRoot "panel")
        try { npm run dev } finally { Pop-Location }
    }
    "agent-dry" {
        Push-Location (Join-Path $RepoRoot "agent")
        try {
            $env:AGENT_DRY_RUN = "true"
            go run ./cmd/clouddeck-agent
        } finally { Pop-Location }
    }
    "typecheck" {
        Push-Location (Join-Path $RepoRoot "panel")
        try { npm run typecheck } finally { Pop-Location }
    }
    default {
        Write-Host "CloudDeck dev helper"
        Write-Host ""
        Write-Host "Usage: .\scripts\dev.ps1 <command>"
        Write-Host ""
        Write-Host "  panel       Start the panel dev server (http://localhost:3000)"
        Write-Host "  agent-dry   Run the Go agent in dry-run mode (Go 1.23+ required)"
        Write-Host "  typecheck   Typecheck the panel (tsc --noEmit)"
    }
}
