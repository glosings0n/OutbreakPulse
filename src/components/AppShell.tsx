"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/triage/", label: "Field report" },
  { href: "/cases/", label: "Cases" },
  { href: "/surveillance/", label: "Surveillance" },
  { href: "/system/", label: "System" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href.replace(/\/$/, ""));
}

export function NetworkStatus() {
  const { online, pendingSync, queuedEnrichments } = useApp();
  return (
    <div className="flex items-center gap-3 text-sm" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className={`h-2 w-2 rounded-full ${online ? "bg-low" : "bg-medium"}`} />
        <span className={online ? "text-ink" : "font-medium text-medium"}>{online ? "Online" : "Offline"}</span>
      </span>
      {pendingSync > 0 && (
        <span className="text-ink-2">
          <span className="mono">{pendingSync}</span> pending sync
        </span>
      )}
      {queuedEnrichments > 0 && (
        <span className="hidden text-ink-2 sm:inline">
          <span className="mono">{queuedEnrichments}</span> queued for AI
        </span>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <rect width="24" height="24" rx="5" fill="#0f766e" />
              <path d="M4 13h4l2-5 3 9 2-6 1 2h4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            OutbreakPulse
          </Link>
          <NetworkStatus />
        </div>
        <nav aria-label="Main" className="mx-auto max-w-6xl overflow-x-auto px-2">
          <ul className="flex gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-[15px] ${
                      active ? "border-brand font-medium text-brand" : "border-transparent text-ink-2 hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-4 text-sm text-ink-2">
          Decision support for trained health workers, not a diagnosis. All demo data is fictional.
        </div>
      </footer>
    </div>
  );
}
