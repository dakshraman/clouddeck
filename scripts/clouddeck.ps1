# CloudDeck Windows Native CLI (WSL 2 Integration)
# Automatically forwards commands into CloudDeck running inside WSL 2
# Usage:
#   clouddeck status [--json]
#   clouddeck doctor [--fix]
#   clouddeck open
#   clouddeck restart [service]
#   clouddeck logs [service] [-f]
#   clouddeck site ...
#   clouddeck app ...
#   clouddeck db ...
#   clouddeck cache ...
#   clouddeck ssl ...
#   clouddeck backup ...
#   clouddeck fleet ...
#   clouddeck security ...
#   clouddeck user ...
#   clouddeck wsl
#   clouddeck version [--json]

# Note: Do not declare [CmdletBinding()] here so PowerShell does NOT intercept
# command-line flags (e.g. -f, --json, --fix, --version, -v) as unknown script parameters!
$Arguments = @($args)

$ErrorActionPreference = "Continue"

try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding          = [System.Text.Encoding]::UTF8
} catch {}

$esc = [char]27
$tcSky = "$esc[38;2;116;184;204m"
$tcMarine = "$esc[38;2;35;83;97m"
$tcPeach = "$esc[38;2;250;170;147m"
$tcSteel = "$esc[38;2;100;148;172m"
$clrReset = "$esc[0m"
$clrBold = "$esc[1m"
$clrDim = "$esc[2m"
$clrGreen = "$esc[38;2;52;199;89m"
$clrRed = "$esc[38;2;255;59;48m"

$isModernConsole = ($env:WT_SESSION -or $env:TERM_PROGRAM -eq "vscode" -or ($Host.UI.RawUI -and [Console]::OutputEncoding.CodePage -eq 65001))
if ($isModernConsole) {
    $gArrow    = [char]0x276F
    $gCheck    = [char]0x2714
    $gBullet   = [char]0x2022
    $gRailTop  = [string][char]0x256D + [string][char]0x2500
    $gRailMid  = [char]0x2502
    $gRailDiv  = [string][char]0x251C + [string][char]0x2500
    $gRailBot  = [string][char]0x2570 + [string][char]0x2500
} else {
    $gArrow    = ">"
    $gCheck    = "[OK]"
    $gBullet   = "*"
    $gRailTop  = "+--"
    $gRailMid  = "|"
    $gRailDiv  = "+--"
    $gRailBot  = "+--"
}

function Write-Line([string]$Text = "", [ConsoleColor]$Color = [ConsoleColor]::White) {
    try { if ([Console]::CursorLeft -gt 0) { [Console]::CursorLeft = 0 } } catch {}
    $esc = [char]27
    Write-Host ("`r$esc[1G" + $Text + "`r") -ForegroundColor $Color
}

$configPath = Join-Path $env:USERPROFILE ".clouddeck\config.json"
$distro = ""
$panelPort = 2083

if (Test-Path $configPath) {
    try {
        $rawCfg = Get-Content -Raw -Path $configPath | ConvertFrom-Json
        if ($rawCfg.Distro) { $distro = $rawCfg.Distro }
        if ($rawCfg.PanelPort) { $panelPort = [int]$rawCfg.PanelPort }
    } catch {}
}

if (-not $distro) {
    try {
        $wslList = (wsl.exe -l -q 2>$null) -replace "`0", ""
        foreach ($d in $wslList) {
            $td = $d.Trim()
            if ($td -match "Ubuntu|Debian") {
                $distro = $td
                break
            }
        }
        if (-not $distro -and $wslList.Count -gt 0) {
            $distro = $wslList[0].Trim()
        }
    } catch {}
}

if (-not $distro) {
    $distro = "Ubuntu"
}

$cmd = if ($Arguments -and $Arguments.Count -gt 0) { $Arguments[0].ToLower() } else { "help" }

switch ($cmd) {
    { $_ -in "help", "--help", "-h" } {
        Write-Line ""
        Write-Line "  +-- CloudDeck Windows Native CLI (WSL 2 Integration)" Cyan
        Write-Line "  |   WSL 2 Target:      $distro" White
        Write-Line "  |   Panel URL:         http://localhost:$panelPort" White
        Write-Line "  |   Tech Stack:        Next.js 16 + Go stdlib daemon" White
        Write-Line "  |" DarkCyan
        Write-Line "  +-- Available CLI Commands:" Yellow
        Write-Line "  |   clouddeck status [--json]     Live stack services, resources & metrics card" Gray
        Write-Line "  |   clouddeck doctor [--fix]      8-point automated health check with self-healing" Gray
        Write-Line "  |   clouddeck open                Open web panel in default Windows browser" Gray
        Write-Line "  |   clouddeck restart [service]   Restart panel, agent, nginx, mariadb, redis" Gray
        Write-Line "  |   clouddeck logs [service] [-f] Stream live service logs (panel, agent, nginx)" Gray
        Write-Line "  |   clouddeck site <subcommand>   Manage sites (list, create, delete, info)" Gray
        Write-Line "  |   clouddeck app <list|install>  1-Click App Store (WordPress, Next.js 16, etc.)" Gray
        Write-Line "  |   clouddeck db <subcommand>     Databases (list, create, drop, users)" Gray
        Write-Line "  |   clouddeck cache <status|purge>FastCGI microcache & Redis cache control" Gray
        Write-Line "  |   clouddeck ssl <list|issue>    SSL/TLS certificates & Let's Encrypt issuance" Gray
        Write-Line "  |   clouddeck backup <list|create>Local and S3 cloud backup archives" Gray
        Write-Line "  |   clouddeck fleet <list|ping>   Multi-server cluster nodes & latency" Gray
        Write-Line "  |   clouddeck security <scan>     AI security posture scan & firewall status" Gray
        Write-Line "  |   clouddeck user <list|add|passwd> Administrator account management" Gray
        Write-Line "  |   clouddeck wsl                 Open interactive bash terminal inside WSL" Gray
        Write-Line "  |   clouddeck version [--json]    Display Next.js 16, Go, Node, and CLI version" Gray
        Write-Line "  |   clouddeck update [version]    Update CloudDeck to the latest release" Gray
        Write-Line "  +------------------------------------------------------------------" Cyan
        Write-Line ""
        exit 0
    }

    "open" {
        $url = "http://localhost:$panelPort"
        Write-Line "  > Opening CloudDeck Web Panel: $url..." Cyan
        Start-Process $url
        exit 0
    }

    { $_ -in "wsl", "shell", "bash" } {
        Write-Line "  > Entering CloudDeck environment inside WSL ($distro)..." Cyan
        & wsl.exe -d $distro -u root
        exit $LASTEXITCODE
    }

    "config" {
        Write-Line ""
        Write-Line "  +-- CloudDeck Windows Configuration" Cyan
        Write-Line "  |   Config File:       $configPath" White
        Write-Line "  |   WSL Distribution:  $distro" White
        Write-Line "  |   Web Panel Port:    $panelPort" White
        Write-Line "  +------------------------------------------------------------------" Cyan
        Write-Line ""
        exit 0
    }

    default {
        if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
            Write-Line "  [X] wsl.exe was not found. Please install WSL 2: wsl --install" Red
            exit 1
        }

        # Format and escape arguments safely for bash -c execution inside WSL
        $escapedArgs = @()
        foreach ($a in $Arguments) {
            $escapedArgs += "'$($a.Replace("'", "'\''"))'"
        }
        $argString = $escapedArgs -join " "

        & wsl.exe -d $distro -u root bash -c "if [ -x /opt/clouddeck/bin/clouddeck ]; then /opt/clouddeck/bin/clouddeck $argString; elif [ -x /usr/local/bin/clouddeck ]; then /usr/local/bin/clouddeck $argString; elif command -v clouddeck >/dev/null 2>&1; then clouddeck $argString; else echo 'CloudDeck is not yet installed in WSL distribution ''$distro''. Run: irm https://clouddeck.dakshraman.in/install.ps1 | iex'; exit 127; fi"
        exit $LASTEXITCODE
    }
}
