"use client";

import { useState, type ReactNode } from "react";
import { errorMessage } from "@/lib/result";
import { useApp } from "./AppProvider";

/** Renders children once a (guest) session exists. One click, no registration. */
export function GuestGate({ children }: { children: ReactNode }) {
  const { configured, authReady, user, online, signInGuest } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!configured) {
    return (
      <div className="card-muted max-w-xl">
        <h2 className="section-title">Firebase is not configured</h2>
        <p className="hint mt-2">
          Copy <code className="mono">.env.example</code> to <code className="mono">.env.local</code>, fill in your Firebase web
          app configuration, then restart the dev server. See the README for the full setup.
        </p>
      </div>
    );
  }

  if (!authReady) {
    return <p className="hint">Restoring your session...</p>;
  }

  if (user) return <>{children}</>;

  return (
    <div className="card max-w-xl">
      <h2 className="section-title">Start a demo session</h2>
      <p className="hint mt-2">
        Guest sessions are anonymous and isolated: you only see the cases you create or load. Nothing you type in a field
        note is stored in identifiable form.
      </p>
      {!online && (
        <p className="mt-3 rounded-md border border-medium bg-medium-surface px-3 py-2 text-sm text-medium">
          The first sign-in needs a connection. After that, field reporting works offline.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-high bg-high-surface px-3 py-2 text-sm text-high">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn-primary mt-4"
        disabled={busy || !online}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await signInGuest();
          } catch (e) {
            setError(`Sign-in failed: ${errorMessage(e)}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing in..." : "Continue as guest"}
      </button>
    </div>
  );
}
