import { ViewTransition } from "react";
import type { Metadata } from "next";
import { Archivo, Geist_Mono } from "next/font/google";
import "./globals.css";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { IS_DEMO_DATA } from "@/lib/demo";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// One family for everything. The width axis gives the condensed display voice
// (`font-display`, `font-figure` in globals.css) without a second download.
const archivo = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
  axes: ["wdth"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_DESCRIPTION =
  "Statistics on Roblox game genres, trends, and estimated earnings — for developers deciding what to build next.";

export const metadata: Metadata = {
  // Lets pages and the generated share images (Task #72) use relative URLs.
  metadataBase: new URL(SITE_URL),
  title: "rodict — Roblox game trends & statistics",
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    title: "rodict — Roblox game trends & statistics",
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider delay={200}>
            <SiteHeader />
            {IS_DEMO_DATA && (
              <p
                role="note"
                className="border-b-2 border-rule bg-muted px-4 py-2 text-center text-sm text-foreground md:px-6"
              >
                Demo data: live collection is paused until November, so the history and trends shown
                here are sample figures.
              </p>
            )}
            {/* min-w-0: a long unbreakable line (an embed snippet, a URL) scrolls in
                its own box instead of widening the page past the screen. */}
            <main className="flex min-w-0 flex-1 flex-col">
              {/* Page changes fade and rise in. Only updates animate; the top
                  bar sits outside and stays put. */}
              <ViewTransition update="page" default="none">
                <div className="flex flex-1 flex-col">{children}</div>
              </ViewTransition>
            </main>
            <SiteFooter />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
