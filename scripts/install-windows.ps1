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

# --- Uni 6-Color Palette ANSI Styling & Terminal Capabilities ----------------
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::InputEncoding  = [System.Text.Encoding]::UTF8
    $OutputEncoding          = [System.Text.Encoding]::UTF8
} catch {}

$esc = [char]27
$tcSky = "$esc[38;2;116;184;204m"       # #74B8CC
$tcMarine = "$esc[38;2;35;83;97m"       # #235361
$tcPeach = "$esc[38;2;250;170;147m"     # #FAAA93
$tcSteel = "$esc[38;2;100;148;172m"     # #6494AC
$tcChestnut = "$esc[38;2;136;99;81m"   # #886351
$tcMauve = "$esc[38;2;210;173;172m"     # #D2ADAC
$tcBgMarine = "$esc[48;2;35;83;97m"
$clrReset = "$esc[0m"
$clrBold = "$esc[1m"
$clrDim = "$esc[2m"
$clrGreen = "$esc[38;2;52;199;89m"
$clrYellow = "$esc[38;2;255;204;0m"
$clrRed = "$esc[38;2;255;59;48m"

# Safe glyph definitions: works across Windows Terminal, VS Code, and legacy PowerShell 5.1
$isModernConsole = [bool]($env:WT_SESSION -or $env:TERM_PROGRAM -or $env:ALACRITTY_WINDOW_ID -or $env:GHOSTTY_RESOURCES_DIR)

if ($isModernConsole) {
    $gArrow    = [char]0x276F       # ❯
    $gCheck    = [char]0x2714       # ✔
    $gBullet   = [char]0x2022       # •
    $gInfo     = [char]0x2139       # ℹ
    $gWarn     = [char]0x25B2       # ▲
    $gErr      = [char]0x2716       # ✖
    $gRadioOn  = [char]0x25CF       # ●
    $gRadioOff = [char]0x25CB       # ○
    $gRailTop  = [string][char]0x256D + [string][char]0x2500  # ╭─
    $gRailMid  = [char]0x2502       # │
    $gRailDiv  = [string][char]0x251C + [string][char]0x2500  # ├─
    $gRailBot  = [string][char]0x2570 + [string][char]0x2500  # ╰─
} else {
    $gArrow    = ">"
    $gCheck    = "[OK]"
    $gBullet   = "*"
    $gInfo     = "[i]"
    $gWarn     = "[!]"
    $gErr      = "[X]"
    $gRadioOn  = "(*)"
    $gRadioOff = "( )"
    $gRailTop  = "+--"
    $gRailMid  = "|"
    $gRailDiv  = "+--"
    $gRailBot  = "+--"
}

function Reset-ConsoleDiscipline {
    try {
        if ([Console]::CursorLeft -ne 0) {
            [Console]::CursorLeft = 0
        }
    } catch {}
}

function Write-Term([string]$msg = "", [switch]$NoNewline) {
    Reset-ConsoleDiscipline
    if ($NoNewline) {
        Write-Host -NoNewline "`r$msg"
    } else {
        Write-Host "`r$msg"
    }
}

function Write-Banner {
    Write-Term ""
    Write-Term "${tcSky}${clrBold}   ██████╗██╗      ██████╗ ██╗   ██╗██████╗ ██████╗ ███████╗ ██████╗██╗  ██╗"
    Write-Term "  ██╔════╝██║     ██╔═══██╗██║   ██║██╔══██╗██╔══██╗██╔════╝██╔════╝██║ ██╔╝"
    Write-Term "  ██║     ██║     ██║   ██║██║   ██║██║  ██║██║  ██║█████╗  ██║     █████╔╝ "
    Write-Term "  ██║     ██║     ██║   ██║██║   ██║██║  ██║██║  ██║██╔══╝  ██║     ██╔═██╗ "
    Write-Term "  ╚██████╗███████╗╚██████╔╝╚██████╔╝██████╔╝██████╔╝███████╗╚██████╗██║  ██╗"
    Write-Term "   ╚═════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝${clrReset}"
    Write-Term ""
    Write-Term "  ${tcBgMarine}${tcSky}${clrBold}  CLOUDDECK  ${clrReset} ${tcPeach}${clrBold}The Modern, Lightweight cPanel Alternative${clrReset}"
    Write-Term "  ${clrDim}Windows & WSL 2 Local Development Suite • Uni 6-Color Edition${clrReset}"
    Write-Term ""
}

function Write-Step([string]$msg) {
    Write-Term "  ${tcSky}${clrBold}$gArrow${clrReset} $msg"
}

function Write-Success([string]$msg) {
    Write-Term "  ${clrGreen}${clrBold}$gCheck${clrReset} $msg"
}

function Write-Info([string]$msg) {
    Write-Term "  ${tcSteel}${clrBold}$gInfo${clrReset} $msg"
}

function Write-Warn([string]$msg) {
    Write-Term "  ${clrYellow}${clrBold}$gWarn${clrReset} $msg"
}

function Write-Err([string]$msg) {
    Write-Term "  ${clrRed}${clrBold}$gErr [ERROR]${clrReset} $msg"
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
            Write-Term "  ${tcSky}${clrBold}$gArrow${clrReset} ${clrBold}Enter an alternate port or press Enter for automatic fallback:${clrReset}"
            $pIn = Read-Host "  ${tcMauve}$gBullet Web Panel Port [suggested free: $suggested]${clrReset}"
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
        Write-Success "Web Panel will listen on port: ${tcPeach}$Port${clrReset}"
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

    Write-Term "  ${tcSteel}$gRailTop System Environment ───────────────────────────────────${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}  ${tcSky}${clrBold}$gRadioOn Host OS:${clrReset}             Windows 10/11"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}  ${tcSky}${clrBold}$gRadioOn WSL 2 Distribution:${clrReset}  $DistroName"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}  ${tcSky}${clrBold}$gRadioOn Target Ports:${clrReset}        Web: ${tcPeach}$Port${clrReset}  ${clrDim}$gRailMid${clrReset}  Agent: ${tcPeach}9090${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}"
    Write-Term "  ${tcSteel}$gRailDiv Choose Installation Profile ──────────────────────────${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}  ${tcPeach}${clrBold}$gRadioOn [1] Recommended Full LEMP Stack${clrReset} ${tcSky}(Default)${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}        ${clrDim}$gBullet Next.js 16 Panel, Go Agent & Windows CLI${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}        ${clrDim}$gBullet Nginx Web Server + MariaDB Database${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}        ${clrDim}$gBullet Multi-PHP Coexistence (8.1-8.4)${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}        ${clrDim}$gBullet Node.js 22 LTS Runtime & npm${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}        ${clrDim}$gBullet Local Root CA in Windows Store (*.local)${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}  ${tcPeach}${clrBold}$gRadioOff [2] Fast Core Development Suite${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}        ${clrDim}$gBullet Next.js 16 Panel, Go Agent & Windows CLI${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}        ${clrDim}$gBullet Nginx + MariaDB + PHP 8.4 + Node.js 22 LTS${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}  ${tcPeach}${clrBold}$gRadioOff [3] Minimal Deck Only${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}        ${clrDim}$gBullet Panel, Agent and CLI only (Bring your own stack)${clrReset}"
    Write-Term "  ${tcSteel}$gRailMid${clrReset}"
    Write-Term "  ${tcSteel}$gRailBot────────────────────────────────────────────────────────${clrReset}"
    Write-Term ""

    $choice = Read-Host "  ${tcSky}${clrBold}$gArrow${clrReset} ${clrBold}Enter choice [1-3] (default: 1)${clrReset}"
    $chosenProfile = $CurrentProfile
    switch ($choice.Trim()) {
        "2" {
            $chosenProfile = "fast"
            Write-Success "Selected: ${tcPeach}${clrBold}Fast Core Development Suite${clrReset}"
        }
        "3" {
            $chosenProfile = "minimal"
            Write-Success "Selected: ${tcPeach}${clrBold}Minimal Deck Only${clrReset}"
        }
        default {
            $chosenProfile = "recommended"
            Write-Success "Selected: ${tcPeach}${clrBold}Recommended Full LEMP Stack${clrReset}"
        }
    }

    $chosenPort = $Port
    $portIn = Read-Host "  ${tcMauve}$gBullet CloudDeck Web Panel Port [$Port]${clrReset}"
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
    $adminAns = Read-Host "  ${tcSky}${clrBold}$gBullet Configure Initial Admin Account? [y/N]${clrReset}"
    if ($adminAns -match "^[yY]") {
        $u = Read-Host "    ${tcMauve}$gBullet Admin Username [admin]${clrReset}"
        $chosenUser = if ($u) { $u } else { "admin" }
        $p = Read-Host "    ${tcMauve}$gBullet Admin Password (leave blank to auto-generate)${clrReset}"
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
        Write-Term ""
        Write-Term "  ${tcSky}${clrBold}$gRailTop Existing CloudDeck Installation Detected ─────────────────${clrReset}"
        Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}${clrBold}$gRadioOn WSL 2 Distribution:${clrReset}  $targetDistro"
        Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}${clrBold}$gRadioOn Installed Version:${clrReset}   $($existing.Version)"
        Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}${clrBold}$gRadioOn Active Panel URL:${clrReset}    http://localhost:$($existing.PanelPort)"
        Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}${clrBold}$gRadioOn Current Profile:${clrReset}    $($existing.Profile)"
        Write-Term "  ${tcSky}$gRailMid${clrReset}"
        Write-Term "  ${tcSky}$gRailDiv Select Maintenance Action ──────────────────────────────────${clrReset}"
        Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}${clrBold}[1] Upgrade to $Version (Recommended)${clrReset}"
        Write-Term "  ${tcSky}$gRailMid${clrReset}        ${clrDim}$gBullet Updates panel, agent & CLI preserving sites & DBs${clrReset}"
        Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}${clrBold}[2] Reinstall / Repair Stack${clrReset}"
        Write-Term "  ${tcSky}$gRailMid${clrReset}        ${clrDim}$gBullet Re-provisions LEMP stack and daemons${clrReset}"
        Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}${clrBold}[3] Open Web Panel in Browser${clrReset}"
        Write-Term "  ${tcSky}$gRailMid${clrReset}        ${clrDim}$gBullet Launches http://localhost:$($existing.PanelPort)${clrReset}"
        Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}${clrBold}[4] Exit${clrReset}"
        Write-Term "  ${tcSky}$gRailBot─────────────────────────────────────────────────────────────${clrReset}"
        Write-Term ""

        $maintChoice = "1"
        if (-not $Yes) {
            $rawMaint = Read-Host "  ${tcSky}${clrBold}$gArrow${clrReset} ${clrBold}Enter choice [1-4] (default: 1)${clrReset}"
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

                Write-Term ""
                Write-Term "  ${tcSky}${clrBold}$gRailTop CloudDeck Upgrade Complete ─────────────────────────${clrReset}"
                Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}${clrBold}$gRadioOn Control Panel URL:${clrReset}   ${clrBold}http://localhost:$PanelPort${clrReset}"
                Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}$gRadioOn Upgraded Version:${clrReset}  $Version"
                Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}$gRadioOn WSL 2 Distribution:${clrReset}  $targetDistro"
                Write-Term "  ${tcSky}$gRailMid${clrReset}"
                Write-Term "  ${tcSky}$gRailDiv Quick Windows CLI Commands ───────────────────────────${clrReset}"
                Write-Term "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck status${clrReset}          Check stack services"
                Write-Term "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck open${clrReset}            Open panel in browser"
                Write-Term "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck restart${clrReset}         Restart all services"
                Write-Term "  ${tcSky}$gRailMid${clrReset}"
                Write-Term "  ${tcSky}$gRailBot───────────────────────────────────────────────────────${clrReset}"
                Write-Term ""
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

    # Completion Summary Card (Left-Rail Claude Code / Antigravity CLI layout)
    Write-Term ""
    Write-Term "  ${tcSky}${clrBold}$gRailTop CloudDeck Installation Complete ────────────────────${clrReset}"
    Write-Term "  ${tcSky}$gRailMid${clrReset}"
    Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}${clrBold}$gRadioOn Control Panel URL:${clrReset}   ${clrBold}http://localhost:$PanelPort${clrReset}"
    Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}$gRadioOn Installed Profile:${clrReset}   $Profile"
    Write-Term "  ${tcSky}$gRailMid${clrReset}  ${tcPeach}$gRadioOn WSL 2 Distribution:${clrReset}  $targetDistro"
    Write-Term "  ${tcSky}$gRailMid${clrReset}"
    Write-Term "  ${tcSky}$gRailDiv Quick Windows CLI Commands ───────────────────────────${clrReset}"
    Write-Term "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck status${clrReset}          Check stack services"
    Write-Term "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck open${clrReset}            Open panel in browser"
    Write-Term "  ${tcSky}$gRailMid${clrReset}    ${tcSteel}clouddeck restart${clrReset}         Restart all services"
    Write-Term "  ${tcSky}$gRailMid${clrReset}"
    Write-Term "  ${tcSky}$gRailBot───────────────────────────────────────────────────────${clrReset}"
    Write-Term ""
    $cleanVersion = if ($Version) { $Version.TrimStart('v') } else { "0.6.55" }
    Write-Success "CloudDeck v$cleanVersion is ready! You can now run 'clouddeck status' or 'clouddeck open'."
}

Invoke-CloudDeckInstaller @args
