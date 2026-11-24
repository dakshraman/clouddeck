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
# Safe for Windows PowerShell 5.1, PowerShell 7, Windows Terminal, VS Code, and classic conhost.
# Strictly emits column-0 flush lines using `r + ESC[1G + CursorLeft discipline.
# Completely immune to staircase drift across all terminals and ConPTY raw modes.

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

function Write-OpenLine {
    param(
        [string]$Text = "",
        [ConsoleColor]$Color = [ConsoleColor]::White,
        [switch]$NoNewline
    )
    try {
        if ([Console]::CursorLeft -gt 0) {
            [Console]::CursorLeft = 0
        }
    } catch {}

    $esc = [char]27
    $flushLeft = "`r$esc[1G"

    if ($NoNewline) {
        Write-Host "$flushLeft$Text" -ForegroundColor $Color -NoNewline
    } else {
        Write-Host "$flushLeft$Text`r" -ForegroundColor $Color
    }
}

function Write-Step([string]$msg) {
    Write-OpenLine "  $gArrow $msg" -Color Cyan
}

function Write-Success([string]$msg) {
    Write-OpenLine "  $gCheck $msg" -Color Green
}

function Write-Info([string]$msg) {
    Write-OpenLine "  $gInfo $msg" -Color DarkCyan
}

function Write-Warn([string]$msg) {
    Write-OpenLine "  $gWarn $msg" -Color Yellow
}

function Write-Err([string]$msg) {
    Write-OpenLine "  $gErr [ERROR] $msg" -Color Red
}

function Write-Banner {
    Write-OpenLine ""
    Write-OpenLine "   ██████╗██╗      ██████╗ ██╗   ██╗██████╗ ██████╗ ███████╗ ██████╗██╗  ██╗" -Color Cyan
    Write-OpenLine "  ██╔════╝██║     ██╔═══██╗██║   ██║██╔══██╗██╔══██╗██╔════╝██╔════╝██║ ██╔╝" -Color Cyan
    Write-OpenLine "  ██║     ██║     ██║   ██║██║   ██║██║  ██║██║  ██║█████╗  ██║     █████╔╝ " -Color Cyan
    Write-OpenLine "  ██║     ██║     ██║   ██║██║   ██║██║  ██║██║  ██║██╔══╝  ██║     ██╔═██╗ " -Color Cyan
    Write-OpenLine "  ╚██████╗███████╗╚██████╔╝╚██████╔╝██████╔╝██████╔╝███████╗╚██████╗██║  ██╗" -Color Cyan
    Write-OpenLine "   ╚═════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝" -Color Cyan
    Write-OpenLine ""
    Write-OpenLine "    CLOUDDECK   The Modern, Lightweight cPanel Alternative" -Color Yellow
    Write-OpenLine "  Windows & WSL 2 Local Development Suite" -Color DarkGray
    Write-OpenLine ""
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
            Write-OpenLine "  Available distributions: $(($distros.Name) -join ', ')" -Color Yellow
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
        $null = & wsl.exe -d $DistroName -u root bash -c "cp '$tempConfLinux' /etc/wsl.conf && chmod 0644 /etc/wsl.conf" 2>$null
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
            $null = & wsl.exe -d $DistroName -u root bash -c "true" 2>$null
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
        $checkCmd = 'if [ -d /opt/clouddeck ] || [ -f /etc/clouddeck/panel.env ] || [ -f /opt/clouddeck/bin/clouddeck ] || [ -f /opt/clouddeck/.clouddeck-version ] || [ -f /opt/clouddeck/.clouddeck-install ]; then ' +
                    '_v=$(cat /opt/clouddeck/.clouddeck-version 2>/dev/null || echo "0.6.58"); ' +
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
    if ($ExistingInstall -and $ExistingInstall.IsInstalled) {
        $p = $ExistingInstall.PanelPort
        if ($p -le 0) { $p = 2083 }
        Write-Info "Web Panel port $p is reserved for your CloudDeck installation."
        return $p
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
            Write-OpenLine "  $gArrow Enter an alternate port or press Enter for automatic fallback:" -Color Cyan
            $pIn = Read-Host "`r  $gBullet Web Panel Port [suggested free: $suggested]"
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

    Write-OpenLine ""
    Write-OpenLine "  System Environment:" -Color Cyan
    Write-OpenLine "    ● Host OS:             Windows 10/11" -Color Gray
    Write-OpenLine "    ● WSL 2 Distribution:  $DistroName" -Color Gray
    Write-OpenLine "    ● Target Ports:        Web Panel: $Port  |  Agent Daemon: 9090" -Color Gray
    Write-OpenLine ""
    Write-OpenLine "  Choose Installation Profile:" -Color Yellow
    Write-OpenLine ""
    Write-OpenLine "  $gRadioOn [1] Recommended Full LEMP Stack (Default)" -Color Yellow
    Write-OpenLine "        $gBullet Next.js 16 Panel, Go Agent & Windows CLI" -Color DarkGray
    Write-OpenLine "        $gBullet Nginx Web Server + MariaDB Database" -Color DarkGray
    Write-OpenLine "        $gBullet Multi-PHP Coexistence (8.1, 8.2, 8.3, 8.4)" -Color DarkGray
    Write-OpenLine "        $gBullet Node.js 22 LTS Runtime & npm" -Color DarkGray
    Write-OpenLine "        $gBullet Local Root CA in Windows Store for Green Padlocks (*.local)" -Color DarkGray
    Write-OpenLine ""
    Write-OpenLine "  $gRadioOff [2] Fast Core Development Suite" -Color Gray
    Write-OpenLine "        $gBullet Next.js 16 Panel, Go Agent & Windows CLI" -Color DarkGray
    Write-OpenLine "        $gBullet Nginx Web Server + MariaDB + PHP 8.4 + Node.js 22 LTS" -Color DarkGray
    Write-OpenLine ""
    Write-OpenLine "  $gRadioOff [3] Minimal Deck Only" -Color Gray
    Write-OpenLine "        $gBullet Panel, Agent and CLI only (Bring your own hosting stack)" -Color DarkGray
    Write-OpenLine ""

    $choice = Read-Host "`r  $gArrow Enter choice [1-3] (default: 1)"
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
    $portIn = Read-Host "`r  $gArrow CloudDeck Web Panel Port [$Port]"
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
    if (-not $chosenUser) {
        $cfgAdmin = Read-Host "`r  $gBullet Configure Initial Admin Account? [y/N]"
        if ($cfgAdmin -match "^[yY]") {
            $uIn = Read-Host "`r    $gBullet Admin Username [admin]"
            $chosenUser = if ($uIn -and $uIn.Trim()) { $uIn.Trim() } else { "admin" }
            $pIn = Read-Host "`r    $gBullet Admin Password (leave blank to auto-generate)"
            $chosenPass = if ($pIn) { $pIn } else { "" }
        }
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
stty onlcr 2>/dev/null || true

if ! command -v curl >/dev/null 2>&1 || ! command -v ca-certificates >/dev/null 2>&1 || ! command -v openssl >/dev/null 2>&1; then
  echo "  • Synchronizing package manager inside WSL ($DistroName)..."
  apt-get update -o Acquire::Retries=3 -o DPkg::Lock::Timeout=60
  echo "  • Installing base prerequisites (curl, ca-certificates, openssl)..."
  apt-get install -y --no-install-recommends -o DPkg::Lock::Timeout=60 curl ca-certificates openssl libatomic1
fi

echo "  • Launching CloudDeck Universal Installer inside WSL ($DistroName)..."
INSTALLER_URL='https://clouddeck.dakshraman.in/install.sh'
if ! curl -fsSL "`$INSTALLER_URL" | bash -s -- $installFlags; then
  echo "  • Primary CDN mirror unavailable, fetching from GitHub repository..."
  curl -fsSL "https://raw.githubusercontent.com/dakshraman/clouddeck/main/scripts/install.sh" | bash -s -- $installFlags
fi
"@

    $tempScript = [System.IO.Path]::GetTempFileName()
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tempScript, ($setupScript -replace "`r`n", "`n"), $utf8NoBom)

    try {
        $tempScriptLinux = (wsl.exe -d $DistroName wslpath -u ($tempScript.Replace('\', '/'))).Trim()
        $wslSetupCmd = "stty onlcr 2>/dev/null || true; cat '$tempScriptLinux' > /tmp/clouddeck-setup.sh && chmod +x /tmp/clouddeck-setup.sh && /tmp/clouddeck-setup.sh"
        
        # Stream live output from WSL into console in real time without capturing into pipeline
        & wsl.exe -d $DistroName -u root bash -c $wslSetupCmd 2>&1 | ForEach-Object {
            $line = $_.ToString().TrimEnd("`r`n")
            if ($line.Trim()) {
                Write-OpenLine "  $line"
            }
        }

        $wslExit = $LASTEXITCODE
        if ($wslExit -ne 0) {
            Write-Err "CloudDeck LEMP stack installation failed inside WSL (exit code $wslExit)."
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
        $adminCmd = "CLOUDDECK_NEW_PASSWORD='$Pass' /opt/clouddeck/bin/clouddeck-cli passwd '$User' 2>/dev/null || /opt/clouddeck/bin/clouddeck user add '$User' 2>/dev/null || true"
        $null = & wsl.exe -d $DistroName -u root bash -c $adminCmd 2>$null
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
        $null = & wsl.exe -d $DistroName -u root bash -c "cat '$tempScriptLinux' > /tmp/clouddeck-ca.sh && chmod +x /tmp/clouddeck-ca.sh && /tmp/clouddeck-ca.sh" 2>$null
        
        $winTempCA = Join-Path $env:TEMP "clouddeck-ca.crt"
        $null = & wsl.exe -d $DistroName -u root cat /etc/clouddeck/ssl/clouddeck-ca.crt > $winTempCA 2>$null

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
        Write-Line "  |   clouddeck user <list|add>     Administrator account management" Gray
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
        Write-OpenLine ""
        Write-OpenLine "  Existing CloudDeck Installation Detected" -Color Cyan
        Write-OpenLine "    ● WSL 2 Distribution:  $targetDistro" -Color Gray
        Write-OpenLine "    ● Installed Version:   $($existing.Version)" -Color Gray
        Write-OpenLine "    ● Active Panel URL:    http://localhost:$($existing.PanelPort)" -Color Cyan
        Write-OpenLine "    ● Current Profile:     $($existing.Profile)" -Color Gray
        Write-OpenLine ""
        Write-OpenLine "  Select Maintenance Action:" -Color Yellow
        Write-OpenLine "    ● [1] Upgrade to $Version (Recommended - preserves sites & DBs)" -Color White
        Write-OpenLine "    ○ [2] Reinstall / Repair Stack" -Color White
        Write-OpenLine "    ○ [3] Open Web Panel in Browser" -Color White
        Write-OpenLine "    ○ [4] Exit" -Color White
        Write-OpenLine ""

        $maintChoice = "1"
        if (-not $Yes) {
            $rawMaint = Read-Host "`r  $gArrow Enter choice [1-4] (default: 1)"
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

                Write-OpenLine ""
                Write-OpenLine "  ================================================================" -Color DarkCyan
                Write-OpenLine "  CloudDeck Upgrade Complete!" -Color Green
                Write-OpenLine "  ================================================================" -Color DarkCyan
                Write-OpenLine "    Control Panel URL:   http://localhost:$PanelPort" -Color Cyan
                Write-OpenLine "    Upgraded Version:    $Version" -Color Gray
                Write-OpenLine "    WSL 2 Distro:        $targetDistro" -Color Gray
                Write-OpenLine ""
                Write-OpenLine "  Quick Windows CLI Commands:" -Color Yellow
                Write-OpenLine "    clouddeck status     Check stack services & health" -Color Gray
                Write-OpenLine "    clouddeck open       Open panel in default browser" -Color Gray
                Write-OpenLine "    clouddeck restart    Restart all stack services" -Color Gray
                Write-OpenLine "    clouddeck wsl        Interactive terminal inside WSL" -Color Gray
                Write-OpenLine "  ================================================================" -Color DarkCyan
                Write-OpenLine ""
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
    Write-OpenLine ""
    Write-OpenLine "  ================================================================" -Color DarkCyan
    Write-OpenLine "  CloudDeck Installation Complete!" -Color Green
    Write-OpenLine "  ================================================================" -Color DarkCyan
    Write-OpenLine "    Control Panel URL:   http://localhost:$PanelPort" -Color Cyan
    Write-OpenLine "    Installed Profile:   $Profile" -Color Gray
    Write-OpenLine "    WSL 2 Distribution:  $targetDistro" -Color Gray
    Write-OpenLine ""
    Write-OpenLine "  Quick Windows CLI Commands:" -Color Yellow
    Write-OpenLine "    clouddeck status     Check stack services & health" -Color Gray
    Write-OpenLine "    clouddeck open       Open panel in default browser" -Color Gray
    Write-OpenLine "    clouddeck restart    Restart all stack services" -Color Gray
    Write-OpenLine "    clouddeck wsl        Interactive terminal inside WSL" -Color Gray
    Write-OpenLine "  ================================================================" -Color DarkCyan
    Write-OpenLine ""
    $cleanVersion = if ($Version) { $Version.TrimStart('v') } else { "0.6.58" }
    Write-Success "CloudDeck v$cleanVersion is ready! You can now run 'clouddeck status' or 'clouddeck open'."
}

Invoke-CloudDeckInstaller @args
