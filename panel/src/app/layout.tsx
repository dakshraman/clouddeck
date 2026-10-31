import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Space_Grotesk } from "next/font/google";
import { THEMES } from "@/lib/themes";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CloudDeck",
  description: "A modern hosting control panel for sites, SSL, and server operations.",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

const themeIds = JSON.stringify(THEMES.map((theme) => theme.id));

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="daylight"
      className={`${spaceGrotesk.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <script
          // Applies stored appearance preferences before first paint.
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("clouddeck.theme");if(t==="clouddeck"){t="daylight";localStorage.setItem("clouddeck.theme","daylight")}if(${themeIds}.indexOf(t)>-1){document.documentElement.dataset.theme=t}if(localStorage.getItem("clouddeck.reduce-motion")==="true"){document.documentElement.dataset.reduceMotion="true"}}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
