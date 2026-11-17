import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { JsonLd } from "@/components/JsonLd";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#235361",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://clouddeck.dakshraman.in"),
  title: {
    default: "CloudDeck — Modern, Blazing-Fast cPanel Alternative",
    template: "%s | CloudDeck",
  },
  description:
    "Websites, multi-PHP (8.1–8.4), polyglot app runtimes (Node.js, Python, Go, Ruby), MariaDB, Postfix/Dovecot email, and PowerDNS — all from one elegant deck consuming under 50MB idle RAM with zero root web processes.",
  applicationName: "CloudDeck",
  authors: [{ name: "Daksh Raman", url: "https://github.com/dakshraman" }],
  creator: "Daksh Raman",
  publisher: "CloudDeck",
  category: "DeveloperApplication",
  keywords: [
    "cPanel alternative",
    "Linux control panel",
    "open source web hosting panel",
    "free cPanel alternative",
    "lightweight server panel",
    "self-hosted control panel",
    "LEMP stack manager",
    "Next.js web panel",
    "PowerDNS manager",
    "multi-PHP control panel",
    "aaPanel alternative",
    "CyberPanel alternative",
    "Coolify alternative",
    "VPS management panel",
    "WSL 2 local LEMP",
    "macOS local LEMP development",
  ],
  alternates: {
    canonical: "https://clouddeck.dakshraman.in",
    types: {
      "text/plain": [
        { url: "/llms.txt", title: "CloudDeck LLM Context" },
        { url: "/llms-full.txt", title: "CloudDeck Full LLM Documentation" },
      ],
    },
  },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/assets/favicon.svg", type: "image/svg+xml" },
      { url: "/assets/icon.svg", type: "image/svg+xml" },
      { url: "/assets/logo.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/assets/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "CloudDeck — Modern, Blazing-Fast cPanel Alternative",
    description:
      "Websites, multi-PHP (8.1–8.4), polyglot app runtimes, MariaDB, Postfix/Dovecot email, and PowerDNS in <50MB RAM with zero root web processes.",
    url: "https://clouddeck.dakshraman.in",
    siteName: "CloudDeck",
    images: [
      {
        url: "/assets/og.png",
        width: 1200,
        height: 630,
        alt: "CloudDeck Modern Hosting Control Panel",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CloudDeck — Modern, Blazing-Fast cPanel Alternative",
    description:
      "Modern hosting deck consuming under 50MB idle RAM with zero root web processes.",
    images: ["/assets/og.png"],
    creator: "@dakshraman",
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} scroll-smooth`}
    >
      <head>
        <JsonLd />
        <link rel="help" href="/llms.txt" title="LLM Context" />
        <link
          rel="alternate"
          type="text/plain"
          href="/llms-full.txt"
          title="Full LLM Documentation"
        />
      </head>
      <body className="min-h-screen bg-[#FAF7F5] font-sans text-[#14242B] antialiased selection:bg-[#74B8CC]/30 selection:text-[#14242B]">
        {children}
      </body>
    </html>
  );
}
