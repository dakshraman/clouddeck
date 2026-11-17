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
        "alternateName": ["CloudDeck Control Panel", "CloudDeck LEMP Stack"],
        "description":
          "Modern, Blazing-Fast Linux Hosting Control Panel & cPanel Alternative consuming under 50MB idle RAM.",
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
          "Modern, blazing-fast, open-source Linux hosting control panel and cPanel alternative. Manage websites, multi-PHP (8.1–8.4), application runtimes, MariaDB, Postfix/Dovecot email, and PowerDNS in under 50MB RAM with zero root web processes.",
        "url": "https://clouddeck.dakshraman.in",
        "downloadUrl": "https://clouddeck.dakshraman.in/install.sh",
        "softwareVersion": "0.6.51",
        "screenshot": "https://clouddeck.dakshraman.in/assets/og.png",
        "image": "https://clouddeck.dakshraman.in/assets/og.png",
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
                "CloudDeck uses a compiled Go binary (stdlib only) for its system agent and a self-contained Next.js 15 server for the web panel. Unlike cPanel's 1990s legacy Perl/CGI monolith, CloudDeck does not run background interpreter daemons or duplicate services. It directly interfaces with native Linux binaries (Nginx, MariaDB, PowerDNS, Postfix) with zero virtualization overhead.",
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
            "name": "Is CloudDeck truly 100% free and open-source?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "Yes. CloudDeck is free and open-source software under an OSI-approved license. There are no monthly per-server fees ($30–$60+/month like cPanel), no per-domain caps, and no paywalled 'Pro' or 'Enterprise' feature restrictions.",
            },
          },
          {
            "@type": "Question",
            "name": "How do Dual-Mode .zip backups protect my data?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "CloudDeck creates standard, cross-platform .zip archives containing your site root and MariaDB database dump. You can download the archive to your personal computer for off-site cold storage or retain it on the server for 1-click in-place restoration, with optional automated sync to Telegram or Google Drive/Dropbox via rclone.",
            },
          },
          {
            "@type": "Question",
            "name": "What Linux distributions are supported?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text":
                "Ubuntu (20.04, 22.04, 24.04 LTS) and Debian (11, 12) on both x86_64 and arm64 architectures are fully automated by the installer. Any systemd-based Linux distribution can run CloudDeck using the static Go agent binary.",
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
