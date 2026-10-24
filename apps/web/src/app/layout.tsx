import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "next-themes";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { SITE_URL } from "@/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "SafeFrame — on-device video content detection",
  description:
    "Detects inappropriate video content entirely in your browser. No server, no uploads — nothing leaves this device.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#14161c" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} min-h-dvh antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <ServiceWorkerRegistrar />
        </ThemeProvider>
      </body>
    </html>
  );
}
