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
        Write-Host ""
        Write-Host "  ${tcSky}${clrBold}$gRailTop CloudDeck Windows Native CLI (WSL 2 Integration) ───────────────${clrReset}"
        Write-Host "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}${clrBold}WSL 2 Target:${clrReset}      $distro"
        Write-Host "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}${clrBold}Panel URL:${clrReset}         http://localhost:$panelPort"
        Write-Host "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}${clrBold}Tech Stack:${clrReset}        Next.js 16 + Go stdlib daemon"
        Write-Host "  ${tcSky}$gRailMid${clrReset}"
        Write-Host "  ${tcSky}$gRailDiv Available CLI Commands ───────────────────────────────────────────${clrReset}"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck status [--json]${clrReset}     Live stack services, resources & metrics card"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck doctor [--fix]${clrReset}      8-point automated health check with self-healing"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck open${clrReset}                Open web panel in default Windows browser"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck restart [service]${clrReset}   Restart panel, agent, nginx, mariadb, redis"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck logs [service] [-f]${clrReset} Stream live service logs (panel, agent, nginx)"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck site <subcommand>${clrReset}    Manage sites (list, create, delete, info)"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck app <list|install>${clrReset}   1-Click App Store (WordPress, Next.js 16, etc.)"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck db <subcommand>${clrReset}      Databases (list, create, drop, users)"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck cache <status|purge>${clrReset}FastCGI microcache & Redis cache control"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck ssl <list|issue>${clrReset}    SSL/TLS certificates & Let's Encrypt issuance"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck backup <list|create>${clrReset}Local and S3 cloud backup archives"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck fleet <list|ping>${clrReset}   Multi-server cluster nodes & latency"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck security <scan>${clrReset}     AI security posture scan & firewall status"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck user <list|add|passwd>${clrReset}Administrator account management"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck wsl${clrReset}                 Open interactive bash terminal inside WSL"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck version [--json]${clrReset}    Display Next.js 16, Go, Node, and CLI version"
        Write-Host "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck update [version]${clrReset}    Update CloudDeck to the latest release"
        Write-Host "  ${tcSky}$gRailMid${clrReset}"
        Write-Host "  ${tcSky}$gRailBot───────────────────────────────────────────────────────────────────${clrReset}"
        Write-Host ""
        exit 0
    }

    "open" {
        $url = "http://localhost:$panelPort"
        Write-Host "  ${tcSky}${clrBold}$gArrow${clrReset} Opening CloudDeck Web Panel: ${tcPeach}$url${clrReset}..."
        Start-Process $url
        exit 0
    }

    { $_ -in "wsl", "shell", "bash" } {
        Write-Host "  ${tcSky}${clrBold}$gArrow${clrReset} Entering CloudDeck environment inside WSL ($distro)..."
        & wsl.exe -d $distro -u root
        exit $LASTEXITCODE
    }

    "config" {
        Write-Host ""
        Write-Host "  ${tcSteel}$gRailTop CloudDeck Windows Configuration ────────────────────────────────${clrReset}"
        Write-Host "  ${tcSteel}$gRailMid${clrReset}  Config File:       $configPath"
        Write-Host "  ${tcSteel}$gRailMid${clrReset}  WSL Distribution:  $distro"
        Write-Host "  ${tcSteel}$gRailMid${clrReset}  Web Panel Port:    $panelPort"
        Write-Host "  ${tcSteel}$gRailBot───────────────────────────────────────────────────────────────────${clrReset}"
        Write-Host ""
        exit 0
    }

    default {
        if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
            Write-Host "  ${clrRed}$gErr wsl.exe was not found. Please install WSL 2: wsl --install${clrReset}"
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
