# Pricing & Licensing — CloudDeck

> CloudDeck is 100% Free and Open-Source Software (FOSS) licensed under the MIT / OSI-approved license. There are no paid tiers, no per-core licenses, no per-domain restrictions, and no artificial feature paywalls.

Last Updated: November 2026
Latest Stable Version: v0.6.53
Website: https://clouddeck.dakshraman.in
Repository: https://github.com/dakshraman/clouddeck

---

## Editions & Tiers

### Community Edition (Full Product)
- **Price:** $0.00 / month ($0.00 / year) — 100% Free Forever
- **License:** Open Source (MIT)
- **Server Limit:** Unlimited servers
- **Domain Limit:** Unlimited websites and subdomains
- **Mailbox Limit:** Unlimited email accounts (Postfix + Dovecot)
- **Database Limit:** Unlimited MariaDB databases
- **Included Capabilities:**
  - Full Web Panel (Next.js 16 + React 19)
  - Zero-Root Security Model (Unprivileged panel user + Go localhost daemon)
  - Memory footprint under 50MB RAM idle (runs on $3.50/mo 1GB VPS)
  - Multi-PHP Coexistence (PHP 8.1, 8.2, 8.3, 8.4 simultaneous FPM sockets)
  - 1-Click PHP Extensions Manager (redis, imagick, opcache, intl, curl, etc.)
  - Visual php.ini Configuration Editor
  - Polyglot App Supervision (Node.js, Python, Go, Ruby via systemd)
  - 8 Built-in AI Coding Agents (Claude Code, OpenAI Codex, Google Antigravity, OpenCode, Aider, Ollama local LLMs, Goose, Hermes Agent)
  - Autonomous Site Doctor with 0-100 Health Scoring & 1-Click Auto-Fix
  - Encrypted AI Key Vault (0600 file permissions with automatic terminal injection)
  - Server AI Chat Assistant (Multi-provider fallback: Anthropic, OpenAI, DeepSeek, Ollama, heuristic)
  - Visual Cron Job Scheduler with standard crontab presets & test runner
  - Production Email Suite (Postfix, Dovecot, SHA-512 crypt passwords, RSA-2048 DKIM, SPF, DMARC)
  - Authoritative PowerDNS Server (SQLite backend)
  - 1-Click Panel SSL (Let's Encrypt TLS + Self-Signed IP SAN certificates)
  - Dual-Mode .zip Backups (Local PC download + in-place server restore + rclone cloud sync)
  - Browser File Explorer & Syntax-Highlighted Code Editor
  - Web Terminal PTY (xterm.js with synchronized sudo elevation)
  - Host Firewall (UFW) & Fail2ban Brute-Force Protection
  - ModSecurity Web Application Firewall (OWASP Core Rule Set)
  - Local Development Suite for Windows 10/11 (WSL 2) and macOS (Apple Silicon & Intel)

---

## Cost Comparison vs Alternatives

| Feature / Metric | CloudDeck | cPanel / WHM | aaPanel | Coolify |
| :--- | :--- | :--- | :--- | :--- |
| **Monthly License** | **$0 / month** | $30–$60+ / month | Freemium ($15–$25/mo Pro) | $0 self-hosted ($5/mo cloud) |
| **Annual Cost (1 Server)** | **$0 / year** | $360 – $720+ / year | $180 – $300 / year | $0 – $60 / year |
| **Annual Cost (5 Servers)**| **$0 / year** | $1,800 – $3,600 / year | $900 – $1,500 / year | $0 – $300 / year |
| **Domain Limits** | **Unlimited** | Tiered (1, 5, 30, 100+ accounts) | Unlimited | Unlimited |
| **Minimum Hardware Cost** | **$3.50/mo (1 vCPU, 1GB RAM)** | $12–$24/mo (Needs 2GB–4GB RAM) | $6–$10/mo (Needs 1GB–2GB RAM) | $6–$10/mo (Needs 2GB RAM) |
| **Idle Memory Consumption**| **< 50 MB RAM** | 1,500 MB – 2,000 MB RAM | 400 MB – 800 MB RAM | 500 MB – 1,200 MB RAM |
| **AI Coding Agents** | **8 Built-in Agents** | None | None | None |
| **Automated Site Doctor** | **Built-in Auto-Fix** | None (Manual logs) | None | None |

---

## How to Install

### Linux (Ubuntu 20.04/22.04/24.04, Debian 11/12)
```bash
curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash
```

### Windows 10/11 (WSL 2 Local Dev)
```powershell
irm https://clouddeck.dakshraman.in/install.ps1 | iex
```

### macOS (Apple Silicon & Intel)
```bash
curl -fsSL https://clouddeck.dakshraman.in/install.sh | bash
```
