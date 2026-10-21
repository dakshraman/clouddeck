import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "CloudDeck",
  description: "A modern hosting control panel for sites, SSL, and server operations.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-[#0B0F17] text-slate-200 antialiased">
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
