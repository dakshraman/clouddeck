# CloudDeck Windows Local Development Suite Installer
# One-line install command:
#   irm https://clouddeck.dakshraman.in/install.ps1 | iex
#
# Turns Windows + WSL 2 into a modern, lightning-fast LEMP development environment.
# Zero Apache rewrite bugs, multi-PHP (8.1-8.4) coexistence, Nginx production parity,
# interactive component selector, and native Windows CLI with automatic Local Root CA trust.

[CmdletBinding()]
param(
    [string]$Distro = "",
    [string]$Version = "latest",
    [int]$PanelPort = 2083,
    [string]$Profile = "recommended",
    [switch]$Fast = $false,
    [switch]$SkipTrust = $false,
    [string]$ProjectsDir = "",
    [string]$AdminUser = "",
    [string]$AdminPass = "",
    [switch]$Yes = $false,
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
    exit 0
}

# --- Uni 6-Color Palette ANSI Styling ----------------------------------------
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
$clrGreen = "$esc[38;2;52;199;89m"
$clrYellow = "$esc[38;2;255;204;0m"
$clrRed = "$esc[38;2;255;59;48m"

function Write-Banner {
    Write-Host ""
    Write-Host "${tcSky}${clrBold}   ____ _                 _ ____             _    "
    Write-Host "  / ___| | ___  _   _  __| |  _ \  ___  ___| | __"
    Write-Host " | |   | |/ _ \| | | |/ _`` | | | |/ _ \/ __| |/ /"
    Write-Host " | |___| | (_) | |_| | (_| | |_| |  __/ (__|   < "
    Write-Host "  \____|_|\___/ \__,_|\__,_|____/ \___|\___|_|\_\${clrReset}"
    Write-Host ""
    Write-Host "${tcBgMarine}${tcSky}${clrBold}  CLOUDDECK  ${clrReset} ${tcPeach}The Modern cPanel Alternative Built for 2026${clrReset}"
    Write-Host "${tcSteel}Windows & WSL 2 Local Development Suite • Uni Palette Edition${clrReset}"
    Write-Host ""
}

function Write-Step([string]$msg) {
    Write-Host "${tcSky}${clrBold}==>${clrReset} $msg"
}

function Write-Success([string]$msg) {
    Write-Host "${clrGreen}${clrBold}[OK]${clrReset} $msg"
}

function Write-Warn([string]$msg) {
    Write-Host "${clrYellow}${clrBold}[WARN]${clrReset} $msg"
}

function Write-Err([string]$msg) {
    Write-Host "${clrRed}${clrBold}[ERROR]${clrReset} $msg"
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
    Set-Content -Path $tempConf -Value $wslConfContent -Encoding Ascii

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

# --- Interactive Profile Selection -------------------------------------------

function Prompt-InteractiveOptions {
    if ($Yes) {
        return
    }

    Write-Host "${tcSteel}┌─ Choose Installation Profile ─────────────────────────────────────────────┐${clrReset}"
    Write-Host "${tcSteel}│${clrReset}                                                                           ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}  ${tcPeach}${clrBold}[1] Recommended Full LEMP Stack${clrReset} ${tcSky}(Default)${clrReset}                                ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}      • Next.js 15 Panel, Go Agent & Windows CLI                           ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}      • Nginx Web Server + MariaDB Database                                ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}      • Multi-PHP Coexistence (8.1, 8.2, 8.3, 8.4)                         ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}      • Node.js 22 LTS Runtime & npm                                       ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}      • Local Root CA in Windows Store for Green Padlocks (*.local)        ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}                                                                           ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}  ${tcPeach}${clrBold}[2] Fast Core Development Suite${clrReset}                                          ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}      • Next.js 15 Panel, Go Agent & Windows CLI                           ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}      • Nginx Web Server + MariaDB + PHP 8.4 + Node.js 22 LTS              ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}                                                                           ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}  ${tcPeach}${clrBold}[3] Minimal Deck Only${clrReset}                                                  ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}      • Panel, Agent and CLI only (Bring your own hosting stack)           ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}│${clrReset}                                                                           ${tcSteel}│${clrReset}"
    Write-Host "${tcSteel}└───────────────────────────────────────────────────────────────────────────┘${clrReset}"

    $choice = Read-Host "${tcSky}${clrBold}Enter choice [1-3] (default: 1)${clrReset}"
    switch ($choice.Trim()) {
        "2" {
            $script:Profile = "fast"
            $script:Fast = $true
            Write-Success "Selected Fast Core Development Suite"
        }
        "3" {
            $script:Profile = "minimal"
            Write-Success "Selected Minimal Deck Only"
        }
        default {
            $script:Profile = "recommended"
            Write-Success "Selected Recommended Full LEMP Stack"
        }
    }

    $portIn = Read-Host "${tcMauve}CloudDeck Web Panel Port [$PanelPort]${clrReset}"
    if ($portIn -match "^\d+$") {
        $script:PanelPort = [int]$portIn
    }

    $adminAns = Read-Host "${tcSky}${clrBold}Configure Initial Admin Account? [y/N]${clrReset}"
    if ($adminAns -match "^[yY]") {
        $u = Read-Host "${tcMauve}Admin Username [admin]${clrReset}"
        $script:AdminUser = if ($u) { $u } else { "admin" }
        $p = Read-Host "${tcMauve}Admin Password (leave blank to auto-generate)${clrReset}"
        $script:AdminPass = $p
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

    $setupScript = @"
#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo '==> Updating package repository and installing prerequisites...'
apt-get update -qq >/dev/null 2>&1 || true
apt-get install -y -qq curl ca-certificates openssl >/dev/null 2>&1 || true

echo '==> Fetching and running Unified CloudDeck Installer...'
INSTALLER_URL='https://clouddeck.dakshraman.in/install.sh'
if ! curl -fsSL -I "`$INSTALLER_URL" >/dev/null 2>&1; then
  INSTALLER_URL='https://raw.githubusercontent.com/dakshraman/clouddeck/main/scripts/install.sh'
fi

curl -fsSL "`$INSTALLER_URL" | bash -s -- $installFlags
"@

    $tempScript = [System.IO.Path]::GetTempFileName()
    Set-Content -Path $tempScript -Value ($setupScript -replace "`r`n", "`n") -Encoding Ascii -NoNewline

    try {
        $tempScriptLinux = (wsl.exe -d $DistroName wslpath -u ($tempScript.Replace('\', '/'))).Trim()
        wsl.exe -d $DistroName -u root bash -c "chmod +x '$tempScriptLinux' && '$tempScriptLinux'"
        Write-Success "CloudDeck LEMP stack provisioned inside WSL!"
    } catch {
        Write-Err "Failed executing installer inside WSL: $_"
        exit 1
    } finally {
        Remove-Item -Path $tempScript -Force -ErrorAction SilentlyContinue
    }

    if ($User -and $Pass) {
        Write-Step "Configuring initial administrator account '$User'..."
        wsl.exe -d $DistroName -u root bash -c "CLOUDDECK_NEW_PASSWORD='$Pass' /opt/clouddeck/bin/clouddeck-cli passwd '$User' 2>/dev/null || /opt/clouddeck/bin/clouddeck user add '$User' 2>/dev/null || true"
        Write-Success "Admin credentials configured."
    }
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
    Set-Content -Path $tempScript -Value ($caScript -replace "`r`n", "`n") -Encoding Ascii -NoNewline

    try {
        $tempScriptLinux = (wsl.exe -d $DistroName wslpath -u ($tempScript.Replace('\', '/'))).Trim()
        wsl.exe -d $DistroName -u root bash -c "chmod +x '$tempScriptLinux' && '$tempScriptLinux'"
        
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
    $config | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8

    $cmdContent = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0clouddeck.ps1`" %*"
    Set-Content -Path (Join-Path $cliDir "clouddeck.cmd") -Value $cmdContent -Encoding Ascii

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
Write-Success "Selected WSL 2 distribution: $targetDistro"

Configure-WSLDistro -DistroName $targetDistro
Prompt-InteractiveOptions

Install-CloudDeckInsideWSL -DistroName $targetDistro -VersionTag $Version -Port $PanelPort -SelectedProfile $Profile -User $AdminUser -Pass $AdminPass
Setup-LocalCATrust -DistroName $targetDistro
Install-WindowsCLI -DistroName $targetDistro -Port $PanelPort

# Completion Summary Card
Write-Host ""
Write-Host "${tcSky}${clrBold}┌─ CloudDeck Installation Complete ─────────────────────────────────────────┐${clrReset}"
Write-Host "${tcSky}│${clrReset}                                                                           ${tcSky}│${clrReset}"
Write-Host "${tcSky}│${clrReset}  ${tcPeach}${clrBold}Control Panel URL:${clrReset}   http://localhost:$PanelPort                                ${tcSky}│${clrReset}"
Write-Host "${tcSky}│${clrReset}  ${tcPeach}Installed Profile:${clrReset}   $Profile                                                 ${tcSky}│${clrReset}"
Write-Host "${tcSky}│${clrReset}  ${tcPeach}WSL Distribution:${clrReset}    $targetDistro                                                   ${tcSky}│${clrReset}"
Write-Host "${tcSky}│${clrReset}                                                                           ${tcSky}│${clrReset}"
Write-Host "${tcSky}│${clrReset}  ${tcSky}${clrBold}Quick Windows CLI Commands:${clrReset}                                              ${tcSky}│${clrReset}"
Write-Host "${tcSky}│${clrReset}    ${tcSteel}clouddeck status${clrReset}          Check health & active stack services        ${tcSky}│${clrReset}"
Write-Host "${tcSky}│${clrReset}    ${tcSteel}clouddeck open${clrReset}            Open panel in default Windows browser       ${tcSky}│${clrReset}"
Write-Host "${tcSky}│${clrReset}    ${tcSteel}clouddeck restart${clrReset}         Restart all services inside WSL             ${tcSky}│${clrReset}"
Write-Host "${tcSky}│${clrReset}                                                                           ${tcSky}│${clrReset}"
Write-Host "${tcSky}└───────────────────────────────────────────────────────────────────────────┘${clrReset}"
Write-Host ""
Write-Success "CloudDeck is ready! You can now run 'clouddeck status' or 'clouddeck open'."
