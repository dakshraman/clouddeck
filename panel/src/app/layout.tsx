import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Space_Grotesk } from "next/font/google";
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
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${spaceGrotesk.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <script
          // Applies the stored appearance preference before first paint.
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("clouddeck.reduce-motion")==="true"){document.documentElement.dataset.reduceMotion="true"}}catch(e){}',
          }}
        />
        {children}
      </body>
    </html>
  );
}
