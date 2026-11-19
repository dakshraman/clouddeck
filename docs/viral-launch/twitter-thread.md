# Twitter / X Viral Launch Thread

### Tweet 1 (The Hook):
```text
cPanel charges $45/month and eats 1.6 GB RAM just idling.

I spent months building an open-source alternative from scratch:

Meet CloudDeck:
• < 50 MB RAM idle
• $0 / 100% free & open-source
• Zero-root web architecture
• Multi-PHP (8.1–8.4) on native Nginx
• Production Mail, PowerDNS & phpMyAdmin

Here's how it works 🧵👇
```
*(Attach side-by-side benchmark image: cPanel vs CloudDeck)*

---

### Tweet 2 (The Resource Benchmark):
```text
The biggest problem with legacy panels is resource bloat.

cPanel runs a 1990s monolithic Perl daemon (whostmgrd) that needs at least 2GB RAM.

CloudDeck uses a compiled static Go binary (~12MB) + Next.js 15 UI (~35MB).

It runs on a $3.50/mo 1GB VPS with 95% of server RAM free for actual traffic.
```
*(Attach htop / memory comparison screenshot)*

---

### Tweet 3 (The Security Model):
```text
Why do aaPanel and CyberPanel keep getting RCE CVEs?

They run web apps directly as root.

CloudDeck's Zero-Root Model:
1. Web panel runs as unprivileged user
2. Talks to Go agent over localhost (127.0.0.1:9090)
3. Commands execute via typed argument slices (`exec.Command`)
4. Zero `sh -c` shell interpolation
```
*(Attach architecture diagram)*

---

### Tweet 4 (Features):
```text
What's included out of the box:
⚡ 1-Click Panel SSL with IP SANs
🐘 Native Multi-PHP (8.1, 8.2, 8.3, 8.4) coexistence
🗄️ Deep-linked phpMyAdmin (system schemas hidden)
📬 Postfix + Dovecot + RSA-2048 DKIM email
🌐 PowerDNS authoritative nameserver
💾 Cross-platform .zip backups (sync to Telegram & GDrive)
```

---

### Tweet 5 (Local Dev Bonus):
```text
Bonus: It also replaces XAMPP / MAMP / WAMP on your development machine.

Runs natively on:
• macOS (via Homebrew + LaunchAgents)
• Windows 10/11 (via WSL 2)

Automates Local Root CA so you get valid green HTTPS padlocks on https://*.local.
```

---

### Tweet 6 (CTA & Links):
```text
CloudDeck is 100% free and open-source.

Try the 1-command installer on Ubuntu/Debian:
curl -fsSL https://clouddeck.dakshraman.in/install.sh | sudo bash

⭐ Star the repo on GitHub:
https://github.com/dakshraman/clouddeck

Website & Live Demo:
https://clouddeck.dakshraman.in
```
