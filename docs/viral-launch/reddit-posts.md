# Reddit Launch Kit

---

## 1. r/selfhosted (350k+ Members)
- **Flair**: `Project` or `Showcase`
- **Timing**: Wednesday or Thursday, 7:00 AM – 9:00 AM PT
- **Title**:
  ```text
  I got tired of cPanel costing $45/mo and eating 1.5GB RAM, so I built CloudDeck: an open-source, <50MB RAM hosting panel in Go & Next.js
  ```
- **Post Content**:
```markdown
Hey r/selfhosted!

If you host websites or client projects on a VPS, you’ve probably felt the pain of legacy control panels:
- **cPanel**: Charges $30–$60/month ($360–$720/year) and consumes 1.5GB+ RAM idle with its legacy 1990s Perl root server (`whostmgrd`).
- **aaPanel & CyberPanel**: Free/freemium, but run their web server directly as `root`, leading to constant critical RCE CVEs.
- **Docker PaaS (Coolify/Dokku)**: Awesome for app containers, but overkill or awkward for bare-metal multi-PHP WordPress/Laravel sites, native email, and PowerDNS.

I spent the past year building **CloudDeck** (https://clouddeck.dakshraman.in) to solve this:

### What makes it different:
1. **< 50MB Idle RAM**: A compiled Go daemon (~12MB) + an unprivileged Next.js 15 UI (~35MB). Leaves 95% of your $3.50/mo 1GB VPS free for real traffic.
2. **Zero-Root Web Security**: The web panel runs as an unprivileged user (`clouddeck`). It talks over localhost only (`127.0.0.1:9090`) to the Go agent using typed argument arrays (`exec.Command`). No shell execution strings (`no sh -c`), making remote command injection impossible.
3. **Multi-PHP Coexistence**: Native PHP 8.1, 8.2, 8.3, and 8.4 coexisting on Nginx via isolated FPM sockets. Switch PHP versions per site with one click.
4. **Production LEMP Mail & DNS**: Postfix + Dovecot + DKIM (RSA-2048) with 1-click publishing of MX, SPF, DMARC, and DKIM into PowerDNS.
5. **Dual-Mode .zip Backups**: Creates standard cross-platform `.zip` archives of your webroot and MariaDB database. Download locally or sync automatically to Telegram / Google Drive.
6. **Local Dev Suite**: Replaces XAMPP / MAMP on Windows 10/11 (WSL 2) and macOS with true Nginx production parity and automated Local Root CA green padlocks.

### 1-Line Universal Install (Debian/Ubuntu/macOS):
```bash
curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash
```

- **Live Demo & Website**: https://clouddeck.dakshraman.in
- **GitHub (100% Open Source)**: https://github.com/dakshraman/clouddeck
- **Technical Specs**: https://clouddeck.dakshraman.in/llms-full.txt

Would love to hear your feedback, feature requests, or test results on your VPS/homelab!
```

---

## 2. r/webdev (2.1M+ Members)
- **Title**:
  ```text
  I built an open-source cPanel alternative that runs on under 50MB RAM with zero root web processes
  ```
- **Focus**: Eliminating monthly server fees for freelance & agency client hosting; developer experience.

---

## 3. r/sysadmin (900k+ Members)
- **Title**:
  ```text
  CloudDeck: An open-source hosting control panel architecture without root web daemons
  ```
- **Focus**: Privilege separation, Go stdlib daemon on localhost only, typed parameter execution slices, JSONL audit logging (`/var/lib/clouddeck/audit.jsonl`), and systemd process supervision.
