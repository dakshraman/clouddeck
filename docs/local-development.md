# Local Development Suite (XAMPP, WAMP & MAMP Alternative)

CloudDeck turns your local development machine (**Windows** via WSL 2 and **macOS** natively) into a modern, production-identical web development workstation.

If you have spent hours debugging Apache `.htaccess` rewrite rules that broke upon deploying to production Nginx, struggled to switch between PHP 8.1 and 8.4 across client projects, or suffered sluggish Apache memory hogs like XAMPP, WAMP, or MAMP, **CloudDeck is built for you**.

---

## ⚡ 1-Command Quick Installation

### Windows 10 & 11 (WSL 2)

Open PowerShell and run:

```powershell
irm https://clouddeck.dakshraman.in/install.ps1 | iex
```

> **What this does:**
> 1. Detects or installs your lightweight Ubuntu/Debian WSL 2 distribution.
> 2. Configures `/etc/wsl.conf` with `systemd=true` and transparent Windows drive permissions (`metadata,umask=22,fmask=11`).
> 3. Provisions the core LEMP stack (**Nginx**, coexisting **PHP 8.1–8.4**, **MariaDB**) in under 60 seconds (`--fast`).
> 4. Generates a CloudDeck Local Root CA and imports it into your Windows Trusted Root Certification Authorities store so `https://localhost:2083` and `https://*.local` display **green padlocks in Chrome, Edge, and Brave**.
> 5. Installs the native Windows CLI tool `clouddeck` into your Windows PATH for instant terminal management.

---

### macOS (Apple Silicon M1/M2/M3/M4 & Intel)

Open Terminal and run:

```bash
curl -fsSL https://clouddeck.dakshraman.in/install-macos.sh | bash
```

> **What this does:**
> 1. Automatically detects CPU architecture (`arm64` Apple Silicon or `x86_64` Intel) and provisions native binaries.
> 2. Provisions the native web stack via Homebrew: **Nginx**, **MariaDB**, **PHP**, and **Node.js**.
> 3. Configures background daemon management using macOS `launchctl` LaunchAgents and `brew services`.
> 4. Installs the CloudDeck Local Root CA into the macOS System Keychain (`security add-trusted-cert`) for trusted HTTPS.
> 5. Symlinks the native macOS CLI command `clouddeck` to `/usr/local/bin/clouddeck` or `~/.clouddeck/bin/clouddeck`.

---

## 💡 Why CloudDeck Replaces XAMPP, WAMP, and MAMP

| Feature | 🏛️ XAMPP / WAMP / MAMP | 🚀 CloudDeck Local Dev |
| :--- | :--- | :--- |
| **Web Server** | Apache `httpd` (Legacy MPM worker / prefork) | **Nginx** (Production parity with modern VPS deployments) |
| **PHP Version Switching** | Global only; requires restarting Apache or swapping complex bin folders | **Per-Site Multi-PHP (8.1, 8.2, 8.3, 8.4)** coexisting simultaneously via isolated PHP-FPM Unix sockets |
| **Rewrite Rule Parity** | Divergent `.htaccess` syntax; fails when deploying to production Nginx | **100% Nginx syntax parity**; copy configs straight to production |
| **Polyglot Stacks** | PHP only (or clunky Perl) | **PHP, Node.js, Python, Go, and Ruby** supervised apps side-by-side |
| **Local SSL / HTTPS** | Self-signed red browser warnings (`NET::ERR_CERT_AUTHORITY_INVALID`) | **Automated Local Root CA** imported to OS keychain; instant **green padlocks** on `*.local` |
| **Database Management** | Bloated global phpMyAdmin instance exposed directly | **1-Click Deep-Linked phpMyAdmin** scoped strictly to the chosen schema + instant `.sql` / `.sql.gz` dump exports |
| **Code Editing Experience** | Edit in local folder; permission conflicts or slow syncing | **Zero permission hassles**; edit files in Windows/macOS VS Code or Cursor with bare-metal speed |
| **Idle Memory Consumption** | 300MB – 600MB+ RAM | **Under 50MB RAM idle** |
| **User Interface** | Dated 1990s desktop dialog box (or basic web index) | **Modern Next.js 15 Dark-Mode Deck** with live log streaming, metrics, and terminal |

---

## 🖥️ Windows Local Dev Workflow (VS Code & Cursor)

### 1. Code in Windows, Serve in Real Linux LEMP
You do not need to move your workflow into an isolated virtual machine. Keep your repositories in Windows:
- `C:\Users\<YourUser>\Projects\my-project`
- or `C:\Sites\my-project`

Open your project in **VS Code**, **Cursor**, or **PhpStorm** in Windows as usual.

### 2. Map Project to CloudDeck
Run the native Windows CLI command:

```powershell
clouddeck link C:\Sites\my-project
```

Output:
```text
Linked Windows folder to WSL!
  Windows: C:\Sites\my-project
  WSL:     /mnt/c/Sites/my-project
  Symlink: /var/www/my-project

Next steps:
1. In CloudDeck panel (http://localhost:2083), click 'Add Site'.
2. Set the Webroot to: /mnt/c/Sites/my-project
3. Edit code in VS Code / Cursor directly at C:\Sites\my-project — zero permission issues!
```

Any file saved in VS Code or Cursor on Windows is immediately served by Nginx and PHP-FPM inside WSL with zero rebuilds or file sync delays!

### 3. Native Windows CLI Reference

The installer adds `clouddeck` to your Windows PATH (accessible from PowerShell, Command Prompt, Git Bash, and integrated editor terminals):

```powershell
# Open CloudDeck web panel in your default Windows browser:
clouddeck open

# Check health and status of panel, agent, Nginx, MariaDB, and PHP-FPM:
clouddeck status

# Start all CloudDeck services inside WSL:
clouddeck start

# Stop services when you finish working:
clouddeck stop

# Restart CloudDeck and web services:
clouddeck restart

# Tail real-time service logs:
clouddeck logs panel -f
clouddeck logs nginx -f
clouddeck logs mysql -f

# Link a Windows project folder:
clouddeck link C:\Projects\laravel-app

# Re-export and trust the CloudDeck Local Root CA:
clouddeck trust

# Drop directly into an interactive bash shell in WSL:
clouddeck shell

# Reset panel administrator password:
clouddeck reset-password
```

---

## 🍏 macOS Local Dev Workflow

On macOS, CloudDeck integrates directly with Homebrew and Apple's native system security:

### Native CLI Commands

```bash
# Open the web panel in Safari or Chrome:
clouddeck open

# Check status of local stack and Homebrew services:
clouddeck status

# Start services via LaunchAgents and brew:
clouddeck start

# Stop services:
clouddeck stop

# Tail live logs:
clouddeck logs panel -f

# Link macOS directory:
clouddeck link ~/Sites/my-app

# Re-trust CA in macOS Keychain:
clouddeck trust
```

### Apple Silicon M-Series Optimization
On Apple Silicon (`arm64`), CloudDeck runs natively without Rosetta 2 translation. The Go daemon and Next.js panel run with near-zero CPU footprint and under 50MB of RAM.

---

## 🔒 Green Padlocks & Local SSL (`*.local`)

In modern browsers, navigating to `https://localhost` or `https://my-app.local` usually triggers jarring security warnings (`Your connection is not private`).

CloudDeck solves this completely:
1. Generates a dedicated **CloudDeck Local Development CA** (`clouddeck-ca.crt`).
2. Generates wildcard and IP Subject Alternative Name (SAN) certificates covering:
   - `localhost`
   - `127.0.0.1`
   - `::1`
   - `*.local`
   - `*.test`
   - `*.clouddeck.local`
3. Installs the root CA certificate into:
   - **Windows**: The `ROOT` store via `certutil -addstore`.
   - **macOS**: The System or Login Keychain via `security add-trusted-cert`.

Once trusted, any site you create with a `.local` domain (e.g., `https://clientsite.local`) displays a **trusted green padlock** in Google Chrome, Microsoft Edge, Brave, and Apple Safari.

---

## 🔄 Migrating from XAMPP, WAMP, or MAMP

### 1. Migrating Your Code Files
- **XAMPP**: Copy your site folders from `C:\xampp\htdocs\<site>` (Windows) or `/Applications/XAMPP/htdocs/<site>` (macOS) to your chosen projects directory (e.g. `C:\Sites\<site>` or `~/Sites/<site>`).
- **WAMP**: Copy from `C:\wamp64\www\<site>`.
- **MAMP**: Copy from `/Applications/MAMP/htdocs/<site>`.

### 2. Migrating Your Databases
1. Export your existing database in phpMyAdmin as `.sql` or `.sql.gz`.
2. In CloudDeck panel, navigate to **Databases** -> **Add Database**.
3. Use CloudDeck's **1-Click SQL Dump & Restore** button to select your `.sql` file and restore it instantly.
4. Launch deep-linked phpMyAdmin to verify tables and run queries.

### 3. Setting Up Virtual Hosts
Instead of accessing projects via awkward subdirectories like `http://localhost/my-project/`:
1. In CloudDeck panel, click **Add Site**.
2. Domain: `my-project.local`
3. Webroot: `/mnt/c/Sites/my-project` (Windows) or `/Users/<user>/Sites/my-project` (macOS).
4. PHP Version: Select any version from **PHP 8.1, 8.2, 8.3, or 8.4**.
5. Add `127.0.0.1 my-project.local` to your `hosts` file (`C:\Windows\System32\drivers\etc\hosts` on Windows or `/etc/hosts` on macOS).
6. Navigate to `https://my-project.local` with instant SSL!
