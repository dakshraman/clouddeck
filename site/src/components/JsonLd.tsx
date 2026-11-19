export function JsonLd() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://clouddeck.dakshraman.in/#organization",
        "name": "CloudDeck",
        "url": "https://clouddeck.dakshraman.in",
        "logo": {
          "@type": "ImageObject",
          "url": "https://clouddeck.dakshraman.in/assets/logo.svg",
          "caption": "CloudDeck Logo",
        },
        "sameAs": ["https://github.com/dakshraman/clouddeck"],
      },
      {
        "@type": "WebSite",
        "@id": "https://clouddeck.dakshraman.in/#website",
        "url": "https://clouddeck.dakshraman.in",
        "name": "CloudDeck",
        "alternateName": [
          "CloudDeck Control Panel",
          "CloudDeck LEMP Stack",
          "CloudDeck AI Control Panel",
        ],
        "description":
          "Modern, Blazing-Fast Linux Hosting Control Panel & cPanel Alternative with 8 native AI coding agents, autonomous Site Doctor auto-fix, visual Cron manager, and multi-PHP consuming under 50MB idle RAM.",
        "publisher": {
          "@id": "https://clouddeck.dakshraman.in/#organization",
        },
        "inLanguage": "en-US",
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://clouddeck.dakshraman.in/#software",
        "name": "CloudDeck",
        "applicationCategory": "DeveloperApplication",
        "applicationSubCategory": "Server Management Control Panel",
        "operatingSystem":
          "Linux (Ubuntu, Debian, RHEL), macOS (Apple Silicon & Intel), Windows 10/11 (WSL 2)",
        "description":
          "Modern, blazing-fast, open-source Linux hosting control panel and cPanel alternative. 8 native AI coding agents (Claude Code, OpenAI Codex, Google Antigravity, OpenCode, Aider, Ollama local models, Goose, Hermes), autonomous Site Doctor with 1-click auto-fix, visual Cron manager, PHP extensions & visual php.ini, multi-PHP (8.1–8.4), MariaDB, Postfix/Dovecot email, and PowerDNS in under 50MB RAM with zero root web processes.",
        "url": "https://clouddeck.dakshraman.in",
        "downloadUrl": "https://clouddeck.dakshraman.in/install.sh",
        "softwareVersion": "0.6.53",
        "screenshot": "https://clouddeck.dakshraman.in/assets/og.png",
        "image": "https://clouddeck.dakshraman.in/assets/og.png",
        "featureList": [
          "8 Native AI Coding Agents (Claude Code, Codex, Antigravity, OpenCode, Aider, Ollama, Goose, Hermes)",
          "Autonomous Site Doctor with 0-100 Health Scoring & 1-Click Auto-Fix",
          "Encrypted AI Key Vault (0600 mode) with web terminal auto-injection",
          "Global Server AI Chat Drawer with intelligent multi-provider fallback",
          "Visual Cron Job Manager with crontab presets and run-now testing",
          "1-Click PHP Extensions Manager & Visual php.ini Editor",
          "Zero-Root Unprivileged Web Panel Architecture (<50MB RAM Idle)",
          "Multi-PHP Coexistence (PHP 8.1, 8.2, 8.3, 8.4 isolated FPM sockets)",
          "Native Nginx Virtual Hosts with HTTP/2 and TLS 1.3",
          "Polyglot App Supervision (Node.js, Python, Go, Ruby via systemd)",
          "MariaDB Database Management with Deep-Linked phpMyAdmin SSO",
          "Production Email Suite (Postfix, Dovecot, SHA-512 crypt, RSA-2048 DKIM)",
          "Authoritative PowerDNS Nameserver (SQLite backend)",
          "1-Click Panel SSL (Let's Encrypt TLS & Self-Signed IP SAN certificates)",
          "Dual-Mode .zip Backups with In-Place Restore and Cloud Sync",
          "Web Terminal PTY (xterm.js with synchronized sudo elevation)",
          "Local Development Suite for Windows 10/11 (WSL 2) and macOS",
        ],
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock",
        },
        "author": {
          "@id": "https://clouddeck.dakshraman.in/#organization",
        },
        "license": "https://github.com/dakshraman/clouddeck/blob/main/LICENSE",
      },
      {
        "@type": "FAQPage",
        "@id": "https://clouddeck.dakshraman.in/#faq",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "How can CloudDeck consume under 50MB RAM when cPanel uses 1.5GB+?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "CloudDeck uses a compiled Go binary (stdlib only) for its system agent and a self-contained Next.js 16 server for the web panel. Unlike cPanel's 1990s legacy Perl/CGI monolith, CloudDeck does not run background interpreter daemons or duplicate services. It directly interfaces with native Linux binaries (Nginx, MariaDB, PowerDNS, Postfix) with zero virtualization overhead.",
            },
          },
          {
            "@type": "Question",
            "name": "What AI coding agents are integrated into CloudDeck?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "CloudDeck natively supports and manages 8 top AI coding agents: Claude Code, OpenAI Codex, Google Antigravity, OpenCode, Aider, Ollama (for offline local models such as Llama 3, DeepSeek-Coder, and Qwen), Goose, and Hermes Agent. You can inspect installation status, install or update agents with one click, and launch them immediately in the built-in browser web terminal.",
            },
          },
          {
            "@type": "Question",
            "name": "How does the autonomous Site Doctor & 1-Click Auto-Fix work?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "Site Doctor analyzes any hosted domain across 6 critical pillars: Nginx virtual host configuration syntax, SSL certificate validity and expiration, DNS record propagation, MariaDB database connectivity, webroot directory ownership/permissions, and PHP error logs. It generates a 0–100 health score with detailed findings and offers a 1-click Auto-Fix button that automatically repairs broken configurations, restores file permissions, and re-requests missing certificates.",
            },
          },
          {
            "@type": "Question",
            "name": "How does the AI Key Vault protect API credentials?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "API credentials for Anthropic, OpenAI, DeepSeek, Google Gemini, and Ollama are stored in an encrypted local vault (/etc/clouddeck/vault.json) with strict 0600 Linux permissions owned by root. The web panel masks keys on retrieval so secrets are never displayed raw in the browser. When you launch the web terminal, stored keys are automatically injected into the shell session so agents run seamlessly without manual credential exports.",
            },
          },
          {
            "@type": "Question",
            "name": "How does the Zero-Root security model prevent RCE exploits?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "The web panel runs as an unprivileged system user ('clouddeck'). It never executes root commands directly. Instead, it sends token-authenticated typed requests over 127.0.0.1:9090 to the privileged Go daemon. The agent executes external commands using explicit, typed argument arrays (exec.Command('nginx', '-t')) with strictly validated regex patterns. Shell string interpolation ('sh -c') is architecturally impossible.",
            },
          },
          {
            "@type": "Question",
            "name": "Can I replace XAMPP / WAMP / MAMP on my Windows or Mac workstation?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "Yes! CloudDeck's Local Development Suite installs cleanly on Windows 10/11 (via WSL 2) and macOS (via Homebrew + native arm64/x86 binaries). You get true Nginx production parity, multi-PHP (8.1–8.4) socket switching, deep-linked phpMyAdmin, and automated Local Root CA green padlocks on https://*.local.",
            },
          },
          {
            "@type": "Question",
            "name": "How does CloudDeck manage cron jobs and scheduled tasks?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "CloudDeck includes a visual cPanel-style Cron Job Manager. You can schedule tasks using human-readable presets (Every Minute, Hourly, Daily, Weekly, Monthly) or standard 5-field crontab syntax. It features 1-click 'Run Now' testing to verify scripts before scheduling, real-time stdout/stderr log capture, and active/inactive toggles.",
            },
          },
          {
            "@type": "Question",
            "name": "Is CloudDeck truly 100% free and open-source?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "Yes. CloudDeck is free and open-source software under an OSI-approved license. There are no monthly per-server fees ($30–$60+/month like cPanel), no per-domain caps, and no paywalled 'Pro' or 'Enterprise' feature restrictions.",
            },
          },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
