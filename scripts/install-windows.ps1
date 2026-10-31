# CloudDeck Windows Local Development Suite Installer
# One-line install command:
#   irm https://clouddeck.dakshraman.in/install.ps1 | iex
#
# Turns Windows + WSL 2 into a modern, lightning-fast LEMP development environment.
# Zero Apache rewrite bugs, multi-PHP (8.1-8.4) coexistence, Nginx production parity,
# and native Windows CLI with automatic Local Root CA trust for green padlocks.

[CmdletBinding()]
param(
    [string]$Distro = "",
    [string]$Version = "latest",
    [int]$PanelPort = 2083,
    [switch]$Fast = $true,
    [switch]$SkipTrust = $false,
    [string]$ProjectsDir = "",
    [string]$AdminUser = "",
    [string]$AdminPass = "",
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host @"
CloudDeck Local Development Suite for Windows (WSL 2)

Usage:
  install-windows.ps1 [options]
  irm https://clouddeck.dakshraman.in/install.ps1 | iex

Parameters:
  -Distro <name>         WSL distribution to use (auto-detected if omitted)
  -Version <tag>         CloudDeck version to install (default: latest)
  -PanelPort <port>      Panel port (default: 2083)
  -Fast                  Fast core LEMP installation (default: true)
  -SkipTrust             Skip importing Local CA into Windows Certificate Store
  -ProjectsDir <path>    Windows projects directory to configure (e.g. C:\Sites)
  -AdminUser <user>      Initial admin username (prompted if omitted)
  -AdminPass <pass>      Initial admin password (prompted if omitted)
  -Help                  Show this help message
"@
    exit 0
}

# --- Styling & Output Helpers ------------------------------------------------

function Write-Banner {
    Write-Host ""
    Write-Host "   ____ _                 _ ____             _    " -ForegroundColor Cyan
    Write-Host "  / ___| | ___  _   _  __| |  _ \  ___  ___| | __" -ForegroundColor Cyan
    Write-Host " | |   | |/ _ \| | | |/ _`` | | | |/ _ \/ __| |/ /" -ForegroundColor Cyan
    Write-Host " | |___| | (_) | |_| | (_| | |_| |  __/ (__|   < " -ForegroundColor Cyan
    Write-Host "  \____|_|\___/ \__,_|\__,_|____/ \___|\___|_|\_\" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Windows & WSL 2 Local Development Suite (XAMPP / WAMP Alternative)" -ForegroundColor White
    Write-Host "  Nginx Parity | Multi-PHP (8.1-8.4) | MariaDB | Native Windows CLI" -ForegroundColor DarkGray
    Write-Host "  =================================================================" -ForegroundColor DarkGray
    Write-Host ""
}

function Write-Step([string]$msg) {
    Write-Host "==> " -ForegroundColor Cyan -NoNewline
    Write-Host $msg -ForegroundColor White
}

function Write-Success([string]$msg) {
    Write-Host "[OK] " -ForegroundColor Green -NoNewline
    Write-Host $msg -ForegroundColor White
}

function Write-Warn([string]$msg) {
    Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline
    Write-Host $msg -ForegroundColor White
}

function Write-Err([string]$msg) {
    Write-Host "[ERROR] " -ForegroundColor Red -NoNewline
    Write-Host $msg -ForegroundColor White
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
            exit 1
        }
    }

    if ($RequestedDistro) {
        $matched = $distros | Where-Object { $_.Name -eq $RequestedDistro }
        if (-not $matched) {
            Write-Err "Requested WSL distribution '$RequestedDistro' not found."
            Write-Host "Available distributions: $(($distros.Name) -join ', ')" -ForegroundColor Yellow
            exit 1
        }
        return $matched[0].Name
    }

    # Auto-detection preference:
    # 1. Default distro if Ubuntu or Debian
    # 2. Any Ubuntu distro
    # 3. Any Debian distro
    # 4. Default distro
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

    return $distros[0].Name
}

# --- WSL Optimization Config -------------------------------------------------

function Configure-WSLDistro([string]$DistroName) {
    Write-Step "Configuring WSL distribution '$DistroName' for local web development..."

    # Configure /etc/wsl.conf for systemd support and permissive Windows drive metadata
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
    Set-Content -Path $tempConf -Value $wslConfContent -Encoding Ascii

    try {
        # Copy to /etc/wsl.conf inside WSL as root
        $tempConfLinux = (wsl.exe -d $DistroName wslpath -u ($tempConf.Replace('\', '/'))).Trim()
        wsl.exe -d $DistroName -u root bash -c "cp '$tempConfLinux' /etc/wsl.conf && chmod 0644 /etc/wsl.conf"
        Write-Success "Optimized /etc/wsl.conf (systemd enabled, Windows drive permissions tuned)."
    } catch {
        Write-Warn "Could not update /etc/wsl.conf automatically: $_"
    } finally {
        Remove-Item -Path $tempConf -Force -ErrorAction SilentlyContinue
    }
}

# --- CloudDeck Installation Inside WSL ---------------------------------------

function Install-CloudDeckInsideWSL {
    param(
        [string]$DistroName,
        [string]$VersionTag,
        [int]$Port,
        [bool]$IsFast,
        [string]$User,
        [string]$Pass
    )

    Write-Step "Provisioning CloudDeck inside WSL ($DistroName)..."

    $installFlags = "--panel-port $Port"
    if ($IsFast) {
        $installFlags += " --fast"
    }
    if ($VersionTag -and $VersionTag -ne "latest") {
        $installFlags += " --version $VersionTag"
    }

    # Shell script to run inside WSL
    $setupScript = @"
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo '==> Checking package manager and prerequisites...'
apt-get update -qq >/dev/null 2>&1 || true
apt-get install -y -qq curl ca-certificates openssl >/dev/null 2>&1 || true

echo '==> Fetching and running CloudDeck installer...'
INSTALLER_URL='https://clouddeck.dakshraman.in/install.sh'
# Fallback check
if ! curl -fsSL -I "\$INSTALLER_URL" >/dev/null 2>&1; then
  INSTALLER_URL='https://raw.githubusercontent.com/dakshraman/clouddeck/main/scripts/install.sh'
fi

curl -fsSL "\$INSTALLER_URL" | bash -s -- $installFlags
"@

    $tempScript = [System.IO.Path]::GetTempFileName()
    Set-Content -Path $tempScript -Value ($setupScript -replace "`r`n", "`n") -Encoding Ascii -NoNewline

    try {
        $tempScriptLinux = (wsl.exe -d $DistroName wslpath -u ($tempScript.Replace('\', '/'))).Trim()
        wsl.exe -d $DistroName -u root bash -c "chmod +x '$tempScriptLinux' && '$tempScriptLinux'"
        Write-Success "CloudDeck core LEMP stack provisioned inside WSL!"
    } catch {
        Write-Err "Failed executing installer inside WSL: $_"
        exit 1
    } finally {
        Remove-Item -Path $tempScript -Force -ErrorAction SilentlyContinue
    }

    # If Admin credentials provided, set them
    if ($User -and $Pass) {
        Write-Step "Configuring initial administrator account '$User'..."
        wsl.exe -d $DistroName -u root bash -c "CLOUDDECK_NEW_PASSWORD='$Pass' /opt/clouddeck/bin/clouddeck-cli passwd '$User' 2>/dev/null || /opt/clouddeck/bin/clouddeck user add '$User' 2>/dev/null || true"
        Write-Success "Admin credentials configured."
    }
}

# --- Local CA Trust Helper ---------------------------------------------------

function Setup-LocalCATrust([string]$DistroName) {
    if ($SkipTrust) {
        Write-Step "Skipping local CA trust configuration (-SkipTrust specified)."
        return
    }

    Write-Step "Setting up Local Development Root CA for green padlocks in Chrome/Edge..."

    # Script to ensure Root CA and local wildcard cert exist inside WSL
    $caScript = @"
#!/bin/bash
set -e
SSL_DIR="/etc/clouddeck/ssl"
mkdir -p "\$SSL_DIR"

CA_KEY="\$SSL_DIR/clouddeck-ca.key"
CA_CRT="\$SSL_DIR/clouddeck-ca.crt"

if [ ! -f "\$CA_CRT" ] || [ ! -f "\$CA_KEY" ]; then
    echo "==> Generating CloudDeck Local Development Root CA..."
    openssl req -x509 -new -nodes \
        -keyout "\$CA_KEY" \
        -sha256 -days 3650 \
        -out "\$CA_CRT" \
        -subj "/CN=CloudDeck Local Development CA/O=CloudDeck Local Dev" >/dev/null 2>&1
    chmod 0600 "\$CA_KEY"
    chmod 0644 "\$CA_CRT"
fi

# Also generate or ensure localhost/local wildcard cert exists
CERT_KEY="\$SSL_DIR/panel.key"
CERT_CRT="\$SSL_DIR/panel.crt"

if [ ! -f "\$CERT_CRT" ] || [ ! -f "\$CERT_KEY" ]; then
    echo "==> Generating SAN SSL certificate for localhost and *.local..."
    CSR="\$SSL_DIR/panel.csr"
    EXT="\$SSL_DIR/panel.ext"

    cat > "\$EXT" <<EOF
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
        -keyout "\$CERT_KEY" \
        -out "\$CSR" \
        -subj "/CN=localhost/O=CloudDeck Local Host" >/dev/null 2>&1

    openssl x509 -req -in "\$CSR" \
        -CA "\$CA_CRT" -CAkey "\$CA_KEY" -CAcreateserial \
        -out "\$CERT_CRT" -days 825 -sha256 \
        -extfile "\$EXT" >/dev/null 2>&1

    rm -f "\$CSR" "\$EXT"
    chmod 0600 "\$CERT_KEY"
    chmod 0644 "\$CERT_CRT"
fi
"@

    $tempScript = [System.IO.Path]::GetTempFileName()
    Set-Content -Path $tempScript -Value ($caScript -replace "`r`n", "`n") -Encoding Ascii -NoNewline

    try {
        $tempScriptLinux = (wsl.exe -d $DistroName wslpath -u ($tempScript.Replace('\', '/'))).Trim()
        wsl.exe -d $DistroName -u root bash -c "chmod +x '$tempScriptLinux' && '$tempScriptLinux'"
        
        # Export CA crt to Windows
        $winTempCA = Join-Path $env:TEMP "clouddeck-ca.crt"
        wsl.exe -d $DistroName -u root cat /etc/clouddeck/ssl/clouddeck-ca.crt > $winTempCA

        if (Test-Path $winTempCA) {
            Write-Step "Importing CloudDeck Local CA into Windows Trusted Root store..."
            # Check if running with administrative rights
            $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
            if ($isAdmin) {
                $out = certutil.exe -addstore -f "ROOT" $winTempCA 2>&1
            } else {
                $out = certutil.exe -addstore -f -user "ROOT" $winTempCA 2>&1
            }
            Remove-Item -Path $winTempCA -Force -ErrorAction SilentlyContinue
            Write-Success "Local Root CA installed! HTTPS on localhost & *.local will now show green padlocks."
        }
    } catch {
        Write-Warn "Could not automatically import local CA into Windows Certificate Store: $_"
        Write-Warn "You can import it manually later using: clouddeck trust"
    } finally {
        Remove-Item -Path $tempScript -Force -ErrorAction SilentlyContinue
    }
}

# --- Project Folder Mapping --------------------------------------------------

function Configure-ProjectMapping([string]$DistroName, [string]$SpecifiedDir) {
    $targetDir = $SpecifiedDir
    if (-not $targetDir) {
        $userProjects = Join-Path $env:USERPROFILE "Projects"
        $cSites = "C:\Sites"
        if (Test-Path $cSites) {
            $targetDir = $cSites
        } elseif (Test-Path $userProjects) {
            $targetDir = $userProjects
        } else {
            $targetDir = $userProjects
            New-Item -ItemType Directory -Path $targetDir -Force -ErrorAction SilentlyContinue | Out-Null
        }
    }

    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force -ErrorAction SilentlyContinue | Out-Null
    }

    try {
        $wslTarget = (wsl.exe -d $DistroName wslpath -u ($targetDir.Replace('\', '/'))).Trim()
        wsl.exe -d $DistroName -u root bash -c "mkdir -p '$wslTarget' && mkdir -p /var/www && ln -sfn '$wslTarget' /var/www/windows"
        Write-Success "Project folder mapped: $targetDir -> $wslTarget (/var/www/windows)"
    } catch {
        Write-Warn "Could not set up project folder symlink automatically: $_"
    }

    return $targetDir
}

# --- Native Windows CLI Installation -----------------------------------------

function Install-WindowsCLI([string]$DistroName, [int]$Port, [string]$MappedProjects) {
    Write-Step "Installing native Windows CLI command 'clouddeck'..."

    $cliDir = Join-Path $env:USERPROFILE ".clouddeck\bin"
    if (-not (Test-Path $cliDir)) {
        New-Item -ItemType Directory -Path $cliDir -Force | Out-Null
    }

    # Save configuration
    $config = @{
        Distro      = $DistroName
        PanelPort   = $Port
        ProjectsDir = $MappedProjects
        InstalledAt = (Get-Date).ToString("o")
    }
    $configPath = Join-Path $env:USERPROFILE ".clouddeck\config.json"
    $config | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8

    # Create clouddeck.ps1
    $psScript = @'
[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [string]$Command = "help",
    [Parameter(Position=1, ValueFromRemainingArguments=$true)]
    [string[]]$Args
)

$configPath = Join-Path $env:USERPROFILE ".clouddeck\config.json"
$distro = "Ubuntu"
$panelPort = 2083
if (Test-Path $configPath) {
    try {
        $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
        if ($cfg.Distro) { $distro = $cfg.Distro }
        if ($cfg.PanelPort) { $panelPort = [int]$cfg.PanelPort }
    } catch {}
}

function Show-Help {
    Write-Host @"
CloudDeck Windows CLI

Usage: clouddeck <command> [options]

Commands:
  clouddeck status                  Check health & status of panel, agent, Nginx, PHP, MariaDB
  clouddeck start                   Start CloudDeck services inside WSL
  clouddeck stop                    Stop CloudDeck services inside WSL
  clouddeck restart                 Restart CloudDeck services
  clouddeck open                    Open the CloudDeck panel in default Windows browser
  clouddeck logs [component] [-f]   Tail logs (panel, agent, nginx, mysql)
  clouddeck link <folder>           Link Windows project folder to WSL webroot
  clouddeck trust                   Export & trust CloudDeck Local Root CA in Windows
  clouddeck shell                   Launch interactive WSL shell in CloudDeck environment
  clouddeck reset-password [user]   Reset panel administrator password
  clouddeck version                 Show CloudDeck version
  clouddeck help                    Display this help message

Web Panel URL: http://localhost:$panelPort
WSL Distro:   $distro
"@
}

switch ($Command.ToLower()) {
    "status" {
        Write-Host "CloudDeck Local Dev Environment ($distro)" -ForegroundColor Cyan
        Write-Host "--------------------------------------------------------" -ForegroundColor DarkGray
        
        # Test Panel
        $panelUrl = "http://localhost:$panelPort"
        $panelStatus = "DOWN"
        try {
            $resp = Invoke-WebRequest -Uri "$panelUrl" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($resp.StatusCode -eq 200 -or $resp.StatusCode -eq 302 -or $resp.StatusCode -eq 401) {
                $panelStatus = "RUNNING (HTTP $($resp.StatusCode))"
            }
        } catch {
            $panelStatus = "STOPPED or STARTING"
        }
        Write-Host "  Panel Web UI:   " -NoNewline
        Write-Host $panelStatus -ForegroundColor $(if ($panelStatus -match "RUNNING") { "Green" } else { "Red" }) -NoNewline
        Write-Host "  -> $panelUrl" -ForegroundColor DarkGray

        # Query services inside WSL
        $queryScript = '
for s in nginx mariadb php8.4-fpm php8.3-fpm php8.2-fpm php8.1-fpm clouddeck-agent clouddeck-panel; do
    if systemctl is-active --quiet "$s" 2>/dev/null; then
        echo "$s: active"
    fi
done
'
        $activeServices = wsl.exe -d $distro -u root bash -c $queryScript 2>$null
        Write-Host "`n  Active Stack Services:" -ForegroundColor White
        if ($activeServices) {
            foreach ($s in ($activeServices -split "`n")) {
                if ($s.Trim()) {
                    Write-Host "    [OK] " -ForegroundColor Green -NoNewline
                    Write-Host $s.Trim() -ForegroundColor White
                }
            }
        } else {
            Write-Host "    (No active systemd services found; run 'clouddeck start')" -ForegroundColor Yellow
        }
    }

    "start" {
        Write-Host "Starting CloudDeck stack in WSL ($distro)..." -ForegroundColor Cyan
        wsl.exe -d $distro -u root bash -c "systemctl start clouddeck-agent clouddeck-panel nginx mariadb 2>/dev/null || /opt/clouddeck/bin/clouddeck start"
        Write-Host "Services started! Open panel at: http://localhost:$panelPort" -ForegroundColor Green
    }

    "stop" {
        Write-Host "Stopping CloudDeck stack in WSL ($distro)..." -ForegroundColor Yellow
        wsl.exe -d $distro -u root bash -c "systemctl stop clouddeck-agent clouddeck-panel 2>/dev/null || /opt/clouddeck/bin/clouddeck stop"
        Write-Host "Services stopped." -ForegroundColor White
    }

    "restart" {
        Write-Host "Restarting CloudDeck stack in WSL ($distro)..." -ForegroundColor Cyan
        wsl.exe -d $distro -u root bash -c "systemctl restart clouddeck-agent clouddeck-panel nginx 2>/dev/null || /opt/clouddeck/bin/clouddeck restart"
        Write-Host "Restart complete." -ForegroundColor Green
    }

    "open" {
        $url = "http://localhost:$panelPort"
        Write-Host "Opening CloudDeck panel: $url" -ForegroundColor Cyan
        Start-Process $url
    }

    "logs" {
        $target = "panel"
        $follow = $false
        foreach ($a in $Args) {
            if ($a -eq "-f") { $follow = $true }
            elseif ($a -match "panel|agent|nginx|mysql|mariadb") { $target = $a }
        }
        $fFlag = if ($follow) { "-f" } else { "" }
        if ($target -eq "nginx") {
            wsl.exe -d $distro -u root bash -c "tail -n 100 $fFlag /var/log/nginx/error.log /var/log/nginx/access.log"
        } elseif ($target -eq "mysql" -or $target -eq "mariadb") {
            wsl.exe -d $distro -u root bash -c "tail -n 100 $fFlag /var/log/mysql/error.log"
        } else {
            wsl.exe -d $distro -u root bash -c "journalctl -u clouddeck-$target -n 100 $fFlag 2>/dev/null || /opt/clouddeck/bin/clouddeck logs $target $fFlag"
        }
    }

    "link" {
        if (-not $Args -or $Args.Length -eq 0) {
            Write-Host "Usage: clouddeck link <Windows-Folder-Path>" -ForegroundColor Yellow
            Write-Host "Example: clouddeck link C:\Sites\my-app" -ForegroundColor DarkGray
            return
        }
        $rawPath = $Args[0]
        $fullPath = [System.IO.Path]::GetFullPath($rawPath)
        if (-not (Test-Path $fullPath)) {
            Write-Host "Folder '$fullPath' does not exist. Creating it..." -ForegroundColor Cyan
            New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        }
        $wslPath = (wsl.exe -d $distro wslpath -u ($fullPath.Replace('\', '/'))).Trim()
        $folderName = Split-Path $fullPath -Leaf
        $symlinkPath = "/var/www/$folderName"

        wsl.exe -d $distro -u root bash -c "ln -sfn '$wslPath' '$symlinkPath'"

        Write-Host "Linked Windows folder to WSL!" -ForegroundColor Green
        Write-Host "  Windows: $fullPath" -ForegroundColor White
        Write-Host "  WSL:     $wslPath" -ForegroundColor White
        Write-Host "  Symlink: $symlinkPath" -ForegroundColor DarkGray
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. In CloudDeck panel (http://localhost:$panelPort), click 'Add Site'."
        Write-Host "2. Set the Webroot to: $wslPath"
        Write-Host "3. Edit code in VS Code / Cursor directly at $fullPath — zero permission issues!"
    }

    "trust" {
        Write-Host "Exporting and trusting CloudDeck Local CA in Windows..." -ForegroundColor Cyan
        $winTempCA = Join-Path $env:TEMP "clouddeck-ca.crt"
        wsl.exe -d $distro -u root cat /etc/clouddeck/ssl/clouddeck-ca.crt > $winTempCA 2>$null
        if (Test-Path $winTempCA) {
            $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
            if ($isAdmin) {
                certutil.exe -addstore -f "ROOT" $winTempCA
            } else {
                certutil.exe -addstore -f -user "ROOT" $winTempCA
            }
            Remove-Item -Path $winTempCA -Force -ErrorAction SilentlyContinue
            Write-Host "CloudDeck CA trusted in Windows Root store!" -ForegroundColor Green
        } else {
            Write-Host "Could not find /etc/clouddeck/ssl/clouddeck-ca.crt inside WSL." -ForegroundColor Red
        }
    }

    "shell" {
        Write-Host "Entering CloudDeck WSL shell ($distro)..." -ForegroundColor Cyan
        wsl.exe -d $distro
    }

    "reset-password" {
        $userArg = if ($Args) { $Args[0] } else { "" }
        wsl.exe -d $distro -u root /opt/clouddeck/bin/clouddeck-cli reset-password $userArg
    }

    "version" {
        $ver = wsl.exe -d $distro -u root cat /opt/clouddeck/.clouddeck-version 2>$null
        Write-Host "CloudDeck $($ver.Trim()) (Windows WSL 2 Dev Suite)" -ForegroundColor Cyan
    }

    default {
        Show-Help
    }
}
'@

    $psPath = Join-Path $cliDir "clouddeck.ps1"
    Set-Content -Path $psPath -Value $psScript -Encoding UTF8

    # Create clouddeck.cmd wrapper for CMD / Git Bash / Cursor / VS Code terminals
    $cmdScript = @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0clouddeck.ps1" %*
"@
    $cmdPath = Join-Path $cliDir "clouddeck.cmd"
    Set-Content -Path $cmdPath -Value $cmdScript -Encoding Ascii

    # Add to User PATH if not already present
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$cliDir*") {
        $newPath = "$currentPath;$cliDir".Trim(";")
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        $env:Path = "$env:Path;$cliDir"
        Write-Success "Added '$cliDir' to User PATH environment variable."
    } else {
        Write-Success "CLI already in User PATH ($cliDir)."
    }
}

# --- Main Flow ---------------------------------------------------------------

Write-Banner

# 1. Target Distro
$targetDistro = Select-TargetDistro -RequestedDistro $Distro
Write-Success "Selected WSL distribution: $targetDistro"

# 2. Configure WSL
Configure-WSLDistro -DistroName $targetDistro

# 3. Provision CloudDeck Inside WSL
Install-CloudDeckInsideWSL -DistroName $targetDistro -VersionTag $Version -Port $PanelPort -IsFast $Fast -User $AdminUser -Pass $AdminPass

# 4. Local CA SSL Trust
Setup-LocalCATrust -DistroName $targetDistro

# 5. Project Folder Mapping
$mappedFolder = Configure-ProjectMapping -DistroName $targetDistro -SpecifiedDir $ProjectsDir

# 6. Install Native Windows CLI
Install-WindowsCLI -DistroName $targetDistro -Port $PanelPort -MappedProjects $mappedFolder

# --- Final Summary -----------------------------------------------------------

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Green
Write-Host "🎉 CloudDeck Local Development Suite is Ready on Windows!" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Web Panel:       http://localhost:$PanelPort" -ForegroundColor Cyan
Write-Host "  Local Dev Root:  $mappedFolder (/var/www/windows)" -ForegroundColor White
Write-Host "  WSL Engine:      $targetDistro (WSL 2, systemd enabled)" -ForegroundColor White
Write-Host "  Nginx & PHP:     Bare-metal inside WSL with coexisting PHP 8.1-8.4" -ForegroundColor White
Write-Host "  SSL Padlocks:    Trusted Root CA active for localhost & *.local" -ForegroundColor White
Write-Host ""
Write-Host "Quick CLI Commands (open a new terminal or run right away):" -ForegroundColor White
Write-Host "  clouddeck open                    # Open panel in Windows browser" -ForegroundColor DarkGray
Write-Host "  clouddeck status                  # Check health of panel & LEMP stack" -ForegroundColor DarkGray
Write-Host "  clouddeck link C:\Sites\my-app     # Map a Windows project to CloudDeck" -ForegroundColor DarkGray
Write-Host "  clouddeck logs panel -f           # Stream real-time logs" -ForegroundColor DarkGray
Write-Host "  clouddeck shell                   # Drop into WSL shell" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Editing Code in VS Code or Cursor:" -ForegroundColor Yellow
Write-Host "  1. Open your project folder in Windows (e.g. $mappedFolder\my-site)." -ForegroundColor DarkGray
Write-Host "  2. In CloudDeck panel, add site pointing to /mnt/c/Users/.../my-site." -ForegroundColor DarkGray
Write-Host "  3. Edit with instant file changes and production Nginx performance!" -ForegroundColor DarkGray
Write-Host ""
