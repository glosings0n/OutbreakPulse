import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Google_Sans, Google_Sans_Code } from "next/font/google";
import { AppProvider } from "@/components/AppProvider";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

// Self-hosted at build time by next/font, so typography also works offline.
const googleSans = Google_Sans({
  variable: "--font-google-sans",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
});

const googleSansCode = Google_Sans_Code({
  variable: "--font-google-sans-code",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "OutbreakPulse",
  description:
    "Offline-first outbreak reporting. Patient data stays on the device with Gemini Nano; county surveillance runs in the cloud on de-identified aggregates.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${googleSans.variable} ${googleSansCode.variable} h-full antialiased`}>
      {/* Browser extensions (color pickers, password managers) add attributes to <body> before hydration.
          This only silences attribute mismatches on this one element, not in its children. */}
      <body className="min-h-full" suppressHydrationWarning>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
