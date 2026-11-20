# CloudDeck Windows Local Development Suite Installer
# One-line install command:
#   irm https://clouddeck.dakshraman.in/install.ps1 | iex
#
# Turns Windows + WSL 2 into a modern, lightning-fast LEMP development environment.
# Zero Apache rewrite bugs, multi-PHP (8.1-8.4) coexistence, Nginx production parity,
# interactive component selector, and native Windows CLI with automatic Local Root CA trust.

function Invoke-CloudDeckInstaller {
    [CmdletBinding()]
    param(
        [string]$Distro = $(if ($env:CLOUDDECK_DISTRO) { $env:CLOUDDECK_DISTRO } else { "" }),
        [string]$Version = $(if ($env:CLOUDDECK_VERSION) { $env:CLOUDDECK_VERSION } else { "latest" }),
        [int]$PanelPort = $(if ($env:CLOUDDECK_PANEL_PORT) { [int]$env:CLOUDDECK_PANEL_PORT } else { 2083 }),
        [string]$Profile = $(if ($env:CLOUDDECK_PROFILE) { $env:CLOUDDECK_PROFILE } else { "recommended" }),
        [switch]$Fast = $(if ($env:CLOUDDECK_FAST -eq "1" -or $env:CLOUDDECK_FAST -eq "true") { $true } else { $false }),
        [switch]$SkipTrust = $(if ($env:CLOUDDECK_SKIP_TRUST -eq "1" -or $env:CLOUDDECK_SKIP_TRUST -eq "true") { $true } else { $false }),
        [string]$ProjectsDir = $(if ($env:CLOUDDECK_PROJECTS_DIR) { $env:CLOUDDECK_PROJECTS_DIR } else { "" }),
        [string]$AdminUser = $(if ($env:CLOUDDECK_ADMIN_USER) { $env:CLOUDDECK_ADMIN_USER } else { "" }),
        [string]$AdminPass = $(if ($env:CLOUDDECK_ADMIN_PASS) { $env:CLOUDDECK_ADMIN_PASS } else { "" }),
        [switch]$Yes = $(if ($env:CLOUDDECK_YES -eq "1" -or $env:CLOUDDECK_YES -eq "true") { $true } else { $false }),
        [switch]$Help
    )

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host @"
CloudDeck Unified Windows & WSL 2 Installer

Usage:
  install-windows.ps1 [options]
  irm https://clouddeck.dakshraman.in/install.ps1 | iex

Parameters:
  -Distro <name>         WSL distribution to use (auto-detected if omitted)
  -Version <tag>         CloudDeck version to install (default: latest)
  -PanelPort <port>      Panel port (default: 2083)
  -Profile <name>        Install profile: recommended, fast, custom, minimal
  -Fast                  Fast core LEMP installation (alias for -Profile fast)
  -SkipTrust             Skip importing Local CA into Windows Certificate Store
  -ProjectsDir <path>    Windows projects directory to configure (e.g. C:\Sites)
  -AdminUser <user>      Initial admin username (prompted if omitted)
  -AdminPass <pass>      Initial admin password (prompted if omitted)
  -Yes                   Non-interactive mode (accept recommended defaults)
  -Help                  Show this help message
"@
    return
}

# --- Terminal Output Helpers --------------------------------------------------
# Safe for Windows PowerShell 5.1, PowerShell 7, Windows Terminal, and classic conhost.
# Strictly emits CRLF (\r\n) atomic lines to prevent terminal staircasing bugs.

$isModernConsole = [bool]($env:WT_SESSION -or $env:TERM_PROGRAM -or $env:ALACRITTY_WINDOW_ID -or $env:GHOSTTY_RESOURCES_DIR)

if ($isModernConsole) {
    $gArrow      = [char]0x276F       # ❯
    $gCheck      = [char]0x2714       # ✔
    $gBullet     = [char]0x2022       # •
    $gInfo       = [char]0x2139       # ℹ
    $gWarn       = [char]0x25B2       # ▲
    $gErr        = [char]0x2716       # ✖
    $gRadioOn    = [char]0x25CF       # ●
    $gRadioOff   = [char]0x25CB       # ○
} else {
    $gArrow      = ">"
    $gCheck      = "[OK]"
    $gBullet     = "*"
    $gInfo       = "[i]"
    $gWarn       = "[!]"
    $gErr        = "[X]"
    $gRadioOn    = "(*)"
    $gRadioOff   = "( )"
}

function Write-Step([string]$msg) {
    Write-Host "  $gArrow $msg" -ForegroundColor Cyan
}

function Write-Success([string]$msg) {
    Write-Host "  $gCheck $msg" -ForegroundColor Green
}

function Write-Info([string]$msg) {
    Write-Host "  $gInfo $msg" -ForegroundColor DarkCyan
}

function Write-Warn([string]$msg) {
    Write-Host "  $gWarn $msg" -ForegroundColor Yellow
}

function Write-Err([string]$msg) {
    Write-Host "  $gErr [ERROR] $msg" -ForegroundColor Red
}

function Write-Banner {
    Write-Host ""
    Write-Host "   ____ _                 _ ____             _" -ForegroundColor Cyan
    Write-Host "  / ___| | ___  _   _  __| |  _ \  ___  ___| | __" -ForegroundColor Cyan
    Write-Host " | |   | |/ _ \| | | |/ _` | | | |/ _ \/ __| |/ /" -ForegroundColor Cyan
    Write-Host " | |___| | (_) | |_| | (_| | |_| |  __/ (__|   <" -ForegroundColor Cyan
    Write-Host "  \____|_|\___/ \__,_|\__,_|____/ \___|\___|_|\_\" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  CLOUDDECK - The Modern, Lightweight cPanel Alternative" -ForegroundColor Yellow
    Write-Host "  Windows & WSL 2 Local Development Suite · Pure TUI Edition" -ForegroundColor DarkGray
    Write-Host ""
}

# --- WSL Detection & Setup ---------------------------------------------------

function Get-WSLDistros {
    $wslCmd = Get-Command wsl.exe -ErrorAction SilentlyContinue
    if (-not $wslCmd) {
        return @()
    }
    try {
        $raw = (wsl.exe -l -v 2>$null) -replace "`0", ""
        $distros = @()
        foreach ($line in $raw) {
            $trimmed = $line.Trim()
            if (-not $trimmed -or $trimmed -match "^NAME\s+STATE") { continue }
            $isDefault = $trimmed.StartsWith("*")
            $clean = $trimmed.TrimStart("*").Trim()
            $parts = $clean -split "\s+"
            if ($parts.Length -ge 1) {
                $distros += [PSCustomObject]@{
                    Name      = $parts[0]
                    IsDefault = $isDefault
                    Running   = ($clean -match "Running")
                    Version   = if ($parts.Length -ge 3) { $parts[2] } else { "2" }
                }
            }
        }
        return $distros
    } catch {
        return @()
    }
}

function Select-TargetDistro {
    param([string]$RequestedDistro)

    $distros = Get-WSLDistros
    if ($distros.Count -eq 0) {
        Write-Step "No WSL distribution detected. Installing Ubuntu for WSL..."
        try {
            Start-Process -FilePath "wsl.exe" -ArgumentList "--install", "-d", "Ubuntu", "--no-launch" -Wait -NoNewWindow
            Write-Success "Ubuntu WSL installation initiated. A system restart may be required if WSL was not previously enabled."
            $distros = Get-WSLDistros
        } catch {
            Write-Err "Failed to run 'wsl --install'. Please enable WSL 2 manually by running: wsl --install"
            return $null
        }
    }

    if ($RequestedDistro) {
        $matched = $distros | Where-Object { $_.Name -eq $RequestedDistro }
        if (-not $matched) {
            Write-Err "Requested WSL distribution '$RequestedDistro' not found."
            Write-Host "Available distributions: $(($distros.Name) -join ', ')" -ForegroundColor Yellow
            return $null
        }
        return $matched[0].Name
    }

    $defaultDistro = $distros | Where-Object { $_.IsDefault }
    if ($defaultDistro -and ($defaultDistro.Name -match "Ubuntu" -or $defaultDistro.Name -match "Debian")) {
        return $defaultDistro.Name
    }

    $ubuntuDistro = $distros | Where-Object { $_.Name -match "Ubuntu" } | Select-Object -First 1
    if ($ubuntuDistro) {
        return $ubuntuDistro.Name
    }

    $debianDistro = $distros | Where-Object { $_.Name -match "Debian" } | Select-Object -First 1
    if ($debianDistro) {
        return $debianDistro.Name
    }

    if ($defaultDistro) {
        return $defaultDistro.Name
    }

    if ($distros.Count -gt 0) {
        return $distros[0].Name
    }
    return $null
}

function Configure-WSLDistro([string]$DistroName) {
    Write-Step "Configuring WSL distribution '$DistroName' for local web development..."

    $wslConfContent = @"
[boot]
systemd=true

[automount]
enabled=true
options="metadata,umask=22,fmask=11"
mountFsTab=true

[network]
generateHosts=true
generateResolvConf=true
"@

    $tempConf = [System.IO.Path]::GetTempFileName()
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tempConf, ($wslConfContent -replace "`r`n", "`n"), $utf8NoBom)

    try {
        $tempConfLinux = (wsl.exe -d $DistroName wslpath -u ($tempConf.Replace('\', '/'))).Trim()
        wsl.exe -d $DistroName -u root bash -c "cp '$tempConfLinux' /etc/wsl.conf && chmod 0644 /etc/wsl.conf"
        Write-Success "Optimized /etc/wsl.conf (systemd enabled, Windows drive permissions tuned)."

        # Check if systemd is running as PID 1; if not, restart WSL distro to boot systemd
        $isSystemdActive = $false
        try {
            $sdCheck = (wsl.exe -d $DistroName -u root bash -c "ps -p 1 -o comm=" 2>$null).Trim()
            if ($sdCheck -eq "systemd") { $isSystemdActive = $true }
        } catch {}

        if (-not $isSystemdActive) {
            Write-Step "Restarting WSL distro '$DistroName' to activate systemd as PID 1..."
            & wsl.exe -t $DistroName 2>$null
            Start-Sleep -Seconds 2
            & wsl.exe -d $DistroName -u root bash -c "true" 2>$null
            Start-Sleep -Seconds 1
        }
    } catch {
        Write-Warn "Could not update /etc/wsl.conf automatically: $_"
    } finally {
        Remove-Item -Path $tempConf -Force -ErrorAction SilentlyContinue
    }
}

# --- Port Collision Detection & Process Attribution -------------------------

function Test-PortInUse([int]$Port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(400, $false)
        if ($wait) {
            $tcp.EndConnect($iar)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
    } catch {}

    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        return $false
    } catch {
        return $true
    }
}

function Find-NextFreePort([int]$StartPort) {
    $candidate = $StartPort
    while ($candidate -le 65535) {
        if (-not (Test-PortInUse $candidate)) {
            return $candidate
        }
        $candidate++
    }
    return $StartPort
}

function Get-PortUsageDetails([int]$Port, [string]$DistroName = "") {
    $res = @{
        IsInUse     = $false
        ProcessName = ""
        ProcessId   = 0
        IsCloudDeck = $false
        Description = ""
    }

    if (-not (Test-PortInUse $Port)) {
        return $res
    }

    $res.IsInUse = $true

    # Check if a process inside WSL is listening on this port
    if ($DistroName) {
        try {
            $wslProc = (wsl.exe -d $DistroName -u root bash -c "ss -tulpn '( sport = :$Port )' 2>/dev/null | grep -E 'node|clouddeck|nginx' || true" 2>$null)
            if ($wslProc -and ($wslProc -replace "`0", "").Trim()) {
                $res.IsCloudDeck = $true
                $res.ProcessName = "CloudDeck"
                $res.Description = "CloudDeck Service inside WSL ($DistroName)"
                return $res
            }
        } catch {}
    }

    # Check Windows TCP connections via Get-NetTCPConnection
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
        if ($conns) {
            $pidToInspect = $conns[0].OwningProcess
            if ($pidToInspect -gt 0) {
                $proc = Get-Process -Id $pidToInspect -ErrorAction SilentlyContinue
                if ($proc) {
                    $res.ProcessId = $pidToInspect
                    $res.ProcessName = $proc.ProcessName
                    if ($proc.ProcessName -match "wslhost|wslservice|wsl") {
                        $res.IsCloudDeck = $true
                        $res.Description = "WSL 2 Port Proxy ($($proc.ProcessName)) - CloudDeck stack"
                    } elseif ($proc.ProcessName -match "clouddeck|node") {
                        $res.IsCloudDeck = $true
                        $res.Description = "CloudDeck ($($proc.ProcessName))"
                    } else {
                        $res.Description = "$($proc.ProcessName) (PID: $pidToInspect)"
                    }
                    return $res
                }
            }
        }
    } catch {}

    # Netstat fallback for Windows PowerShell 5.1
    try {
        $netstatOut = netstat -ano | Select-String ":$Port\s+.*LISTENING\s+(\d+)"
        if ($netstatOut) {
            $m = [regex]::Match($netstatOut.ToString(), ":$Port\s+.*LISTENING\s+(\d+)")
            if ($m.Success) {
                $pId = [int]$m.Groups[1].Value
                $res.ProcessId = $pId
                $proc = Get-Process -Id $pId -ErrorAction SilentlyContinue
                $pName = if ($proc) { $proc.ProcessName } else { "PID $pId" }
                $res.ProcessName = $pName
                if ($pName -match "wslhost|wslservice|wsl") {
                    $res.IsCloudDeck = $true
                    $res.Description = "WSL 2 Port Proxy ($pName) - CloudDeck stack"
                } elseif ($pName -match "clouddeck|node") {
                    $res.IsCloudDeck = $true
                    $res.Description = "CloudDeck ($pName)"
                } else {
                    $res.Description = "$pName (PID: $pId)"
                }
                return $res
            }
        }
    } catch {}

    $res.Description = "Port $Port"
    return $res
}

function Get-ExistingCloudDeckInstall([string]$DistroName) {
    if (-not $DistroName) { return @{ IsInstalled = $false } }
    try {
        $checkCmd = 'if [ -f /opt/clouddeck/.clouddeck-version ] || [ -f /opt/clouddeck/.clouddeck-install ] || [ -f /etc/clouddeck/panel.env ]; then ' +
                    '_v=$(cat /opt/clouddeck/.clouddeck-version 2>/dev/null || echo "installed"); ' +
                    '_p=$(grep -E "^PORT=" /etc/clouddeck/panel.env 2>/dev/null | cut -d= -f2 || echo "2083"); ' +
                    '_prof=$(grep -E "^PROFILE=" /opt/clouddeck/.clouddeck-install 2>/dev/null | cut -d= -f2 || echo "recommended"); ' +
                    'echo "$_v|$_p|$_prof"; ' +
                    'fi'
        $res = (wsl.exe -d $DistroName -u root bash -c $checkCmd 2>$null)
        if ($res) {
            $trimmed = ($res -replace "`0", "").Trim()
            if ($trimmed) {
                $parts = $trimmed.Split('|')
                $pVal = if ($parts.Length -gt 1 -and $parts[1] -match '^\d+$') { [int]$parts[1] } else { 2083 }
                $profVal = if ($parts.Length -gt 2 -and $parts[2]) { $parts[2] } else { "recommended" }
                return @{
                    IsInstalled = $true
                    Version     = $parts[0]
                    PanelPort   = $pVal
                    Profile     = $profVal
                }
            }
        }
    } catch {}
    return @{ IsInstalled = $false }
}

function Ensure-PortsAvailable([int]$Port = 2083, [string]$DistroName = "", [hashtable]$ExistingInstall = $null) {
    if ($ExistingInstall -and $ExistingInstall.IsInstalled -and $ExistingInstall.PanelPort -eq $Port) {
        Write-Info "Web Panel port $Port is reserved for this CloudDeck installation."
        return $Port
    }

    $usage = Get-PortUsageDetails -Port $Port -DistroName $DistroName
    if ($usage.IsInUse) {
        if ($usage.IsCloudDeck) {
            Write-Info "Web Panel port $Port is held by existing CloudDeck service ($($usage.Description))."
            return $Port
        }

        $suggested = Find-NextFreePort ($Port + 1)
        Write-Warn "Target Web Panel port $Port is currently in use by $($usage.Description)."
        
        if (-not $Yes) {
            Write-Host "  $gArrow Enter an alternate port or press Enter for automatic fallback:" -ForegroundColor Cyan
            $pIn = Read-Host "  $gBullet Web Panel Port [suggested free: $suggested]"
            if ($pIn -match "^\d+$") {
                $candidate = [int]$pIn
                $candUsage = Get-PortUsageDetails -Port $candidate -DistroName $DistroName
                if ($candUsage.IsInUse -and $candidate -ne $Port) {
                    $nextFree = Find-NextFreePort ($candidate + 1)
                    Write-Warn "Port $candidate is also busy ($($candUsage.Description))! Automatically falling back to $nextFree."
                    $Port = $nextFree
                } else {
                    $Port = $candidate
                }
            } else {
                $Port = $suggested
            }
        } else {
            Write-Info "Automatically falling back to free port: $Port -> $suggested"
            $Port = $suggested
        }
        Write-Success "Web Panel will listen on port: $Port"
    }
    return $Port
}

# --- Interactive Profile Selection -------------------------------------------

function Prompt-InteractiveOptions {
    param(
        [string]$DistroName = "Ubuntu",
        [int]$Port = 2083,
        [string]$CurrentProfile = "recommended",
        [string]$User = "",
        [string]$Pass = ""
    )

    if ($Yes -or $Fast) {
        return @{
            Profile   = if ($Fast) { "fast" } else { $CurrentProfile }
            PanelPort = $Port
            AdminUser = $User
            AdminPass = $Pass
        }
    }

    Write-Host ""
    Write-Host "  System Environment:" -ForegroundColor Cyan
    Write-Host "    Host OS:            Windows 10/11" -ForegroundColor Gray
    Write-Host "    WSL 2 Distribution: $DistroName" -ForegroundColor Gray
    Write-Host "    Target Ports:       Web Panel: $Port  |  Agent Daemon: 9090" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Choose Installation Profile:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  $gRadioOn [1] Recommended Full LEMP Stack (Default)" -ForegroundColor Yellow
    Write-Host "        $gBullet Next.js 16 Panel, Go Agent & Windows CLI" -ForegroundColor DarkGray
    Write-Host "        $gBullet Nginx Web Server + MariaDB Database" -ForegroundColor DarkGray
    Write-Host "        $gBullet Multi-PHP Coexistence (8.1, 8.2, 8.3, 8.4)" -ForegroundColor DarkGray
    Write-Host "        $gBullet Node.js 22 LTS Runtime & npm" -ForegroundColor DarkGray
    Write-Host "        $gBullet Local Root CA in Windows Store for Green Padlocks (*.local)" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  $gRadioOff [2] Fast Core Development Suite" -ForegroundColor Gray
    Write-Host "        $gBullet Next.js 16 Panel, Go Agent & Windows CLI" -ForegroundColor DarkGray
    Write-Host "        $gBullet Nginx Web Server + MariaDB + PHP 8.4 + Node.js 22 LTS" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  $gRadioOff [3] Minimal Deck Only" -ForegroundColor Gray
    Write-Host "        $gBullet Panel, Agent and CLI only (Bring your own hosting stack)" -ForegroundColor DarkGray
    Write-Host ""

    $choice = Read-Host "  $gArrow Enter choice [1-3] (default: 1)"
    $chosenProfile = $CurrentProfile
    switch ($choice.Trim()) {
        "2" {
            $chosenProfile = "fast"
            Write-Success "Selected: Fast Core Development Suite"
        }
        "3" {
            $chosenProfile = "minimal"
            Write-Success "Selected: Minimal Deck Only"
        }
        default {
            $chosenProfile = "recommended"
            Write-Success "Selected: Recommended Full LEMP Stack"
        }
    }

    $chosenPort = $Port
    $portIn = Read-Host "  $gArrow CloudDeck Web Panel Port [$Port]"
    if ($portIn -match "^\d+$") {
        $candidate = [int]$portIn
        if (Test-PortInUse $candidate -and $candidate -ne $chosenPort) {
            $nextFree = Find-NextFreePort ($candidate + 1)
            Write-Warn "Port $candidate is busy! Automatically falling back to free port $nextFree."
            $chosenPort = $nextFree
        } else {
            $chosenPort = $candidate
        }
    }

    $chosenUser = $User
    $chosenPass = $Pass
    $adminAns = Read-Host "  $gArrow Configure Initial Admin Account? [y/N]"
    if ($adminAns -match "^[yY]") {
        $u = Read-Host "    Admin Username [admin]"
        $chosenUser = if ($u) { $u } else { "admin" }
        $p = Read-Host "    Admin Password (leave blank to auto-generate)"
        $chosenPass = $p
    }

    return @{
        Profile   = $chosenProfile
        PanelPort = $chosenPort
        AdminUser = $chosenUser
        AdminPass = $chosenPass
    }
}

# --- Execute Unified Installer inside WSL ------------------------------------

function Install-CloudDeckInsideWSL {
    param(
        [string]$DistroName,
        [string]$VersionTag,
        [int]$Port,
        [string]$SelectedProfile,
        [string]$User,
        [string]$Pass
    )

    Write-Step "Provisioning CloudDeck via Unified Installer inside WSL ($DistroName)..."

    $installFlags = "--yes --panel-port $Port --profile $SelectedProfile"
    if ($VersionTag -and $VersionTag -ne "latest") {
        $installFlags += " --version $VersionTag"
    }
    if ($User) {
        $installFlags += " --admin-user '$User'"
    }
    if ($Pass) {
        $installFlags += " --admin-pass '$Pass'"
    }

    $setupScript = @"
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

if ! command -v curl >/dev/null 2>&1 || ! command -v ca-certificates >/dev/null 2>&1 || ! command -v openssl >/dev/null 2>&1; then
  echo "  >> Synchronizing package manager inside WSL ($DistroName)..."
  apt-get update -o Acquire::Retries=3
  echo "  >> Installing base dependencies: curl, ca-certificates, openssl..."
  apt-get install -y --no-install-recommends curl ca-certificates openssl libatomic1
fi

echo "  >> Launching CloudDeck Unified Installer inside WSL ($DistroName)..."
INSTALLER_URL='https://clouddeck.dakshraman.in/install.sh'
if ! curl -fsSL "`$INSTALLER_URL" | bash -s -- $installFlags; then
  echo "  >> Primary CDN mirror unavailable, fetching from GitHub repository..."
  curl -fsSL "https://raw.githubusercontent.com/dakshraman/clouddeck/main/scripts/install.sh" | bash -s -- $installFlags
fi
"@

    $tempScript = [System.IO.Path]::GetTempFileName()
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tempScript, ($setupScript -replace "`r`n", "`n"), $utf8NoBom)

    try {
        $tempScriptLinux = (wsl.exe -d $DistroName wslpath -u ($tempScript.Replace('\', '/'))).Trim()
        wsl.exe -d $DistroName -u root bash -c "cat '$tempScriptLinux' > /tmp/clouddeck-setup.sh && chmod +x /tmp/clouddeck-setup.sh && /tmp/clouddeck-setup.sh"
        if ($LASTEXITCODE -ne 0) {
            Write-Err "CloudDeck LEMP stack installation failed inside WSL (exit code $LASTEXITCODE)."
            return $false
        }
        Write-Success "CloudDeck LEMP stack provisioned inside WSL!"
    } catch {
        Write-Err "Failed executing installer inside WSL: $_"
        return $false
    } finally {
        Remove-Item -Path $tempScript -Force -ErrorAction SilentlyContinue
    }

    if ($User -and $Pass) {
        Write-Step "Configuring initial administrator account '$User'..."
        wsl.exe -d $DistroName -u root bash -c "CLOUDDECK_NEW_PASSWORD='$Pass' /opt/clouddeck/bin/clouddeck-cli passwd '$User' 2>/dev/null || /opt/clouddeck/bin/clouddeck user add '$User' 2>/dev/null || true"
        Write-Success "Admin credentials configured."
    }
    return $true
}

# --- Local CA Trust in Windows Store -----------------------------------------

function Setup-LocalCATrust([string]$DistroName) {
    if ($SkipTrust) {
        Write-Step "Skipping local CA trust configuration (-SkipTrust specified)."
        return
    }

    Write-Step "Setting up Local Development Root CA for green padlocks in Chrome/Edge..."

    $caScript = @"
#!/bin/bash
set -e
SSL_DIR="/etc/clouddeck/ssl"
mkdir -p "`$SSL_DIR"

CA_KEY="`$SSL_DIR/clouddeck-ca.key"
CA_CRT="`$SSL_DIR/clouddeck-ca.crt"

if [ ! -f "`$CA_CRT" ] || [ ! -f "`$CA_KEY" ]; then
    echo "==> Generating CloudDeck Local Development Root CA..."
    openssl req -x509 -new -nodes \
        -keyout "`$CA_KEY" \
        -sha256 -days 3650 \
        -out "`$CA_CRT" \
        -subj "/CN=CloudDeck Local Development CA/O=CloudDeck Local Dev" >/dev/null 2>&1
    chmod 0600 "`$CA_KEY"
    chmod 0644 "`$CA_CRT"
fi
"@

    $tempScript = [System.IO.Path]::GetTempFileName()
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tempScript, ($caScript -replace "`r`n", "`n"), $utf8NoBom)

    try {
        $tempScriptLinux = (wsl.exe -d $DistroName wslpath -u ($tempScript.Replace('\', '/'))).Trim()
        wsl.exe -d $DistroName -u root bash -c "cat '$tempScriptLinux' > /tmp/clouddeck-ca.sh && chmod +x /tmp/clouddeck-ca.sh && /tmp/clouddeck-ca.sh"
        
        $winTempCA = Join-Path $env:TEMP "clouddeck-ca.crt"
        wsl.exe -d $DistroName -u root cat /etc/clouddeck/ssl/clouddeck-ca.crt > $winTempCA

        if (Test-Path $winTempCA) {
            Write-Step "Importing CloudDeck Local CA into Windows Trusted Root store..."
            $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
            if ($isAdmin) {
                $null = certutil.exe -addstore -f "ROOT" $winTempCA 2>&1
            } else {
                $null = certutil.exe -addstore -f -user "ROOT" $winTempCA 2>&1
            }
            Remove-Item -Path $winTempCA -Force -ErrorAction SilentlyContinue
            Write-Success "Local Root CA installed! HTTPS on localhost & *.local will now show green padlocks."
        }
    } catch {
        Write-Warn "Could not automatically import local CA into Windows Certificate Store: $_"
    } finally {
        Remove-Item -Path $tempScript -Force -ErrorAction SilentlyContinue
    }
}

# --- Native Windows CLI Installation -----------------------------------------

function Install-WindowsCLI([string]$DistroName, [int]$Port) {
    Write-Step "Installing native Windows CLI command 'clouddeck'..."

    $cliDir = Join-Path $env:USERPROFILE ".clouddeck\bin"
    if (-not (Test-Path $cliDir)) {
        New-Item -ItemType Directory -Path $cliDir -Force | Out-Null
    }

    $config = @{
        Distro      = $DistroName
        PanelPort   = $Port
        InstalledAt = (Get-Date).ToString("o")
    }
    $configPath = Join-Path $env:USERPROFILE ".clouddeck\config.json"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json), $utf8NoBom)

    $cmdContent = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0clouddeck.ps1`" %*"
    Set-Content -Path (Join-Path $cliDir "clouddeck.cmd") -Value $cmdContent -Encoding Ascii

    # Write clouddeck.ps1 (Native Windows PowerShell CLI router for WSL 2)
    $ps1Content = @'
$Arguments = @($args)
$ErrorActionPreference = "Continue"

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
        Write-Host "  +-- CloudDeck Windows Native CLI (WSL 2 Integration)" -ForegroundColor Cyan
        Write-Host "  |   WSL 2 Target:      $distro" -ForegroundColor White
        Write-Host "  |   Panel URL:         http://localhost:$panelPort" -ForegroundColor White
        Write-Host "  |   Tech Stack:        Next.js 16 + Go stdlib daemon" -ForegroundColor White
        Write-Host "  |" -ForegroundColor DarkCyan
        Write-Host "  +-- Available CLI Commands:" -ForegroundColor Yellow
        Write-Host "  |   clouddeck status [--json]     Live stack services, resources & metrics card" -ForegroundColor Gray
        Write-Host "  |   clouddeck doctor [--fix]      8-point automated health check with self-healing" -ForegroundColor Gray
        Write-Host "  |   clouddeck open                Open web panel in default Windows browser" -ForegroundColor Gray
        Write-Host "  |   clouddeck restart [service]   Restart panel, agent, nginx, mariadb, redis" -ForegroundColor Gray
        Write-Host "  |   clouddeck logs [service] [-f] Stream live service logs (panel, agent, nginx)" -ForegroundColor Gray
        Write-Host "  |   clouddeck site <subcommand>   Manage sites (list, create, delete, info)" -ForegroundColor Gray
        Write-Host "  |   clouddeck app <list|install>  1-Click App Store (WordPress, Next.js 16, etc.)" -ForegroundColor Gray
        Write-Host "  |   clouddeck db <subcommand>     Databases (list, create, drop, users)" -ForegroundColor Gray
        Write-Host "  |   clouddeck cache <status|purge>FastCGI microcache & Redis cache control" -ForegroundColor Gray
        Write-Host "  |   clouddeck ssl <list|issue>    SSL/TLS certificates & Let's Encrypt issuance" -ForegroundColor Gray
        Write-Host "  |   clouddeck backup <list|create>Local and S3 cloud backup archives" -ForegroundColor Gray
        Write-Host "  |   clouddeck fleet <list|ping>   Multi-server cluster nodes & latency" -ForegroundColor Gray
        Write-Host "  |   clouddeck security <scan>     AI security posture scan & firewall status" -ForegroundColor Gray
        Write-Host "  |   clouddeck user <list|add>     Administrator account management" -ForegroundColor Gray
        Write-Host "  |   clouddeck wsl                 Open interactive bash terminal inside WSL" -ForegroundColor Gray
        Write-Host "  |   clouddeck version [--json]    Display Next.js 16, Go, Node, and CLI version" -ForegroundColor Gray
        Write-Host "  |   clouddeck update [version]    Update CloudDeck to the latest release" -ForegroundColor Gray
        Write-Host "  +------------------------------------------------------------------" -ForegroundColor Cyan
        Write-Host ""
        exit 0
    }

    "open" {
        $url = "http://localhost:$panelPort"
        Write-Host "  > Opening CloudDeck Web Panel: $url..." -ForegroundColor Cyan
        Start-Process $url
        exit 0
    }

    { $_ -in "wsl", "shell", "bash" } {
        Write-Host "  > Entering CloudDeck environment inside WSL ($distro)..." -ForegroundColor Cyan
        & wsl.exe -d $distro -u root
        exit $LASTEXITCODE
    }

    "config" {
        Write-Host ""
        Write-Host "  +-- CloudDeck Windows Configuration" -ForegroundColor Cyan
        Write-Host "  |   Config File:       $configPath" -ForegroundColor White
        Write-Host "  |   WSL Distribution:  $distro" -ForegroundColor White
        Write-Host "  |   Web Panel Port:    $panelPort" -ForegroundColor White
        Write-Host "  +------------------------------------------------------------------" -ForegroundColor Cyan
        Write-Host ""
        exit 0
    }

    default {
        if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
            Write-Host "  [X] wsl.exe was not found. Please install WSL 2: wsl --install" -ForegroundColor Red
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
'@
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $cliDir "clouddeck.ps1"), $ps1Content, $utf8NoBom)

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -notmatch [regex]::Escape($cliDir)) {
        [Environment]::SetEnvironmentVariable("Path", "$cliDir;$userPath", "User")
        $env:Path = "$cliDir;$env:Path"
        Write-Success "Added $cliDir to user PATH."
    }
}

# --- Main Flow ---------------------------------------------------------------

    Write-Banner
    $targetDistro = Select-TargetDistro -RequestedDistro $Distro
    if (-not $targetDistro) {
        return
    }
    Write-Success "Selected WSL 2 distribution: $targetDistro"

    $existing = Get-ExistingCloudDeckInstall -DistroName $targetDistro
    if ($existing.IsInstalled) {
        Write-Host ""
        Write-Host "  Existing CloudDeck Installation Detected" -ForegroundColor Cyan
        Write-Host "    WSL 2 Distribution: $targetDistro" -ForegroundColor Gray
        Write-Host "    Installed Version:  $($existing.Version)" -ForegroundColor Gray
        Write-Host "    Active Panel URL:   http://localhost:$($existing.PanelPort)" -ForegroundColor Cyan
        Write-Host "    Current Profile:    $($existing.Profile)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  Select Maintenance Action:" -ForegroundColor Yellow
        Write-Host "    [1] Upgrade to $Version (Recommended - preserves sites & DBs)" -ForegroundColor White
        Write-Host "    [2] Reinstall / Repair Stack" -ForegroundColor White
        Write-Host "    [3] Open Web Panel in Browser" -ForegroundColor White
        Write-Host "    [4] Exit" -ForegroundColor White
        Write-Host ""

        $maintChoice = "1"
        if (-not $Yes) {
            $rawMaint = Read-Host "  $gArrow Enter choice [1-4] (default: 1)"
            if ($rawMaint -and $rawMaint.Trim()) {
                $maintChoice = $rawMaint.Trim()
            }
        }

        switch ($maintChoice) {
            "3" {
                $panelUrl = "http://localhost:$($existing.PanelPort)"
                Write-Step "Opening CloudDeck Web Panel: $panelUrl..."
                Start-Process $panelUrl
                return
            }
            "4" {
                Write-Info "Installer exited. Your existing CloudDeck installation remains active."
                return
            }
            "2" {
                Write-Step "Proceeding with full reinstallation / repair..."
                $PanelPort = $existing.PanelPort
                $Profile = $existing.Profile
            }
            default {
                Write-Step "Upgrading CloudDeck to $Version..."
                $PanelPort = $existing.PanelPort
                $Profile = $existing.Profile
                Configure-WSLDistro -DistroName $targetDistro
                $installed = Install-CloudDeckInsideWSL -DistroName $targetDistro -VersionTag $Version -Port $PanelPort -SelectedProfile $Profile -User $AdminUser -Pass $AdminPass
                if (-not $installed) {
                    return
                }
                Setup-LocalCATrust -DistroName $targetDistro
                Install-WindowsCLI -DistroName $targetDistro -Port $PanelPort

                Write-Host ""
                Write-Host "  ================================================================" -ForegroundColor DarkCyan
                Write-Host "  CloudDeck Upgrade Complete!" -ForegroundColor Green
                Write-Host "  ================================================================" -ForegroundColor DarkCyan
                Write-Host "    Control Panel URL:   http://localhost:$PanelPort" -ForegroundColor Cyan
                Write-Host "    Upgraded Version:    $Version" -ForegroundColor Gray
                Write-Host "    WSL 2 Distro:        $targetDistro" -ForegroundColor Gray
                Write-Host ""
                Write-Host "  Quick Windows CLI Commands:" -ForegroundColor Yellow
                Write-Host "    clouddeck status     Check stack services & health" -ForegroundColor Gray
                Write-Host "    clouddeck open       Open panel in default browser" -ForegroundColor Gray
                Write-Host "    clouddeck restart    Restart all stack services" -ForegroundColor Gray
                Write-Host "    clouddeck wsl        Interactive terminal inside WSL" -ForegroundColor Gray
                Write-Host "  ================================================================" -ForegroundColor DarkCyan
                Write-Host ""
                Write-Success "CloudDeck upgraded! Run 'clouddeck open' or 'clouddeck status'."
                return
            }
        }
    }

    $PanelPort = Ensure-PortsAvailable -Port $PanelPort -DistroName $targetDistro -ExistingInstall $existing

    $opts = Prompt-InteractiveOptions -DistroName $targetDistro -Port $PanelPort -CurrentProfile $Profile -User $AdminUser -Pass $AdminPass
    $Profile = $opts.Profile
    $PanelPort = $opts.PanelPort
    $AdminUser = $opts.AdminUser
    $AdminPass = $opts.AdminPass

    Configure-WSLDistro -DistroName $targetDistro

    $installed = Install-CloudDeckInsideWSL -DistroName $targetDistro -VersionTag $Version -Port $PanelPort -SelectedProfile $Profile -User $AdminUser -Pass $AdminPass
    if (-not $installed) {
        return
    }

    Setup-LocalCATrust -DistroName $targetDistro
    Install-WindowsCLI -DistroName $targetDistro -Port $PanelPort

    # Completion Summary
    Write-Host ""
    Write-Host "  ================================================================" -ForegroundColor DarkCyan
    Write-Host "  CloudDeck Installation Complete!" -ForegroundColor Green
    Write-Host "  ================================================================" -ForegroundColor DarkCyan
    Write-Host "    Control Panel URL:   http://localhost:$PanelPort" -ForegroundColor Cyan
    Write-Host "    Installed Profile:   $Profile" -ForegroundColor Gray
    Write-Host "    WSL 2 Distribution:  $targetDistro" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Quick Windows CLI Commands:" -ForegroundColor Yellow
    Write-Host "    clouddeck status     Check stack services & health" -ForegroundColor Gray
    Write-Host "    clouddeck open       Open panel in default browser" -ForegroundColor Gray
    Write-Host "    clouddeck restart    Restart all stack services" -ForegroundColor Gray
    Write-Host "    clouddeck wsl        Interactive terminal inside WSL" -ForegroundColor Gray
    Write-Host "  ================================================================" -ForegroundColor DarkCyan
    Write-Host ""
    $cleanVersion = if ($Version) { $Version.TrimStart('v') } else { "0.6.55" }
    Write-Success "CloudDeck v$cleanVersion is ready! You can now run 'clouddeck status' or 'clouddeck open'."
}

Invoke-CloudDeckInstaller @args
