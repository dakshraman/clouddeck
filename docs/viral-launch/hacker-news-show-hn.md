# Hacker News Launch Kit: Show HN

## Submission Details
- **Platform**: [https://news.ycombinator.com/submit](https://news.ycombinator.com/submit)
- **Best Timing**: Tuesday or Wednesday between **8:00 AM – 9:30 AM PT (11:00 AM – 12:30 PM ET)**.
- **URL**: `https://clouddeck.dakshraman.in`
- **Title**:
  ```text
  Show HN: CloudDeck – An open-source cPanel alternative using <50MB RAM (Go + Next.js)
  ```

---

## First Comment / Post Text (Post immediately after submitting)

```markdown
Hi HN, I'm Daksh, creator of CloudDeck (https://clouddeck.dakshraman.in).

Like many developers, I’ve been frustrated by the current state of Linux web hosting panels:
1. cPanel charges $30–$60+/month per VPS ($360–$720/year), runs a 1990s legacy Perl/CGI monolith (whostmgrd), and consumes 1.5GB+ RAM idle before you even deploy a single website.
2. Lightweight alternatives (aaPanel, CyberPanel) run web servers directly as root, leading to recurring high-severity RCE vulnerabilities.
3. PaaS solutions like Coolify are great for Docker, but don't handle bare-metal LEMP, native coexisting PHP-FPM versions on Nginx, or production email (Postfix/Dovecot/DKIM).

I built CloudDeck to fix this with three core architectural decisions:

1. Under 50MB Idle RAM: Built with a compiled static Go binary (stdlib only) for the privileged agent (~12MB) and Next.js 15 for the unprivileged web panel (~35MB). It runs easily on a $4/mo 1GB VPS with 95% of server memory left for application traffic.
2. Zero-Root Web Process: The browser only talks to an unprivileged Next.js UI (port 2083/2082). The panel communicates over localhost only (127.0.0.1:9090) with the Go agent via authenticated typed argument arrays (exec.Command("nginx", "-t")). Raw shell interpolation (sh -c) is architecturally impossible.
3. Full LEMP Parity: Multi-PHP (8.1, 8.2, 8.3, 8.4) socket coexistence on native Nginx, deep-linked phpMyAdmin (system schemas hidden), Postfix + Dovecot email with 1-click DKIM/SPF/DMARC sync into PowerDNS, and cross-platform .zip backups.
4. Local Dev Suite: Runs on Windows 10/11 (WSL 2) and macOS (Homebrew + LaunchAgents) as a modern XAMPP/MAMP replacement with automated Local Root CA green padlocks.

Install command on Debian/Ubuntu:
curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash

Code & Architecture: https://github.com/dakshraman/clouddeck
Technical Specs: https://clouddeck.dakshraman.in/llms-full.txt

I'd love to hear your feedback on the security model and feature priorities!
```

---

## Anticipated HN Questions & Ready Responses

### Q1: "Why not just use Docker or Coolify?"
> **Answer**:
> *"Coolify is fantastic for containerized full-stack apps! But for PHP/WordPress/Laravel agencies and traditional web hosts, Docker introduces non-trivial overhead on small 1GB–2GB VPS instances. CloudDeck provides native bare-metal LEMP performance, native coexisting PHP-FPM sockets (8.1, 8.2, 8.3, 8.4), a full production mail server (Postfix + Dovecot + DKIM), and authoritative DNS (PowerDNS)—things that are notoriously painful to manage in pure Docker."*

### Q2: "Isn't Next.js too heavy for a control panel?"
> **Answer**:
> *"The panel uses Next.js 15 standalone output, compiled down with zero external runtime daemon bloat. It idles around 35MB RAM. Most importantly, it runs as an unprivileged system user (`clouddeck`), which separates the web UI from the privileged Go daemon. This guarantees that even if a zero-day existed in the UI layer, an attacker does not have root access on the host."*

### Q3: "How do you prevent command injection without root?"
> **Answer**:
> *"The Go agent daemon listens exclusively on `127.0.0.1:9090` and requires a high-entropy secret token. All mutations are strictly typed structs; commands are executed via explicit parameter slices (`exec.Command("nginx", "-t")`), completely avoiding shell wrappers (`sh -c`). Input fields (domains, IP ranges, usernames) are validated with strict regex prior to execution."*
