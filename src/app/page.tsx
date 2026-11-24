"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { GuestGate } from "@/components/GuestGate";
import { DEVICE_LABELS } from "@/lib/ai/device";
import { buildDemoCases } from "@/lib/demo/seed";
import { deleteDemoCases, writeDemoCases } from "@/lib/firebase/firestore";
import { useNow } from "@/lib/hooks";
import { errorMessage } from "@/lib/result";

const TIERS = [
  {
    title: "On the device",
    mode: "ONLY_ON_DEVICE",
    text: "Gemini Nano reads the raw note, extracts a structured case and finds names to remove. The note never leaves the phone.",
  },
  {
    title: "Rules engine",
    mode: "Deterministic",
    text: "Clinical danger-sign rules set the risk floor instantly, with or without AI, online or offline. AI can raise it, never lower it.",
  },
  {
    title: "In the cloud",
    mode: "PREFER_ON_DEVICE / ONLY_IN_CLOUD",
    text: "Only de-identified text or aggregate counts reach the cloud: for devices without Nano, and for the county situation report.",
  },
] as const;

function Workspace() {
  const { user, cases, online, pendingSync } = useApp();
  const [busy, setBusy] = useState<"load" | "reset" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const demoCount = cases.filter((c) => c.isDemo).length;
  const now = useNow();
  const highThisWeek = cases.filter((c) => c.riskLevel === "HIGH" && c.clientCreatedAt > now - 7 * 864e5).length;

  async function loadDemo() {
    if (!user) return;
    setBusy("load");
    setMessage(null);
    try {
      if (demoCount === 0) await writeDemoCases(buildDemoCases(user.uid, user.uid));
      setMessage("Demo cases loaded. Open Surveillance to see the Riverside cluster.");
    } catch (e) {
      setMessage(`Could not load demo cases: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function resetDemo() {
    if (!user) return;
    setBusy("reset");
    setMessage(null);
    try {
      const n = await deleteDemoCases(user.uid);
      setMessage(`${n} demo cases removed.`);
    } catch (e) {
      setMessage(`Could not remove demo cases: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Cases in your workspace" value={cases.length} />
        <Stat label="High risk, last 7 days" value={highThisWeek} />
        <Stat label="Waiting to sync" value={pendingSync} />
      </div>
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Demo dataset</h2>
          <p className="hint mt-1">About 45 fictional cases over three weeks in Lakeshore County, with an emerging cluster in Riverside.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {demoCount > 0 ? (
            <button type="button" className="btn-secondary" disabled={busy !== null || !online} onClick={() => void resetDemo()}>
              {busy === "reset" ? "Removing..." : "Remove demo cases"}
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={busy !== null || !online} onClick={() => void loadDemo()}>
              {busy === "load" ? "Loading..." : "Load demo cases"}
            </button>
          )}
        </div>
      </div>
      {message && (
        <p role="status" className="hint">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href="/triage/" className="btn-primary">
          New field report
        </Link>
        <Link href="/surveillance/" className="btn-secondary">
          Open surveillance
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="hint">{label}</p>
      <p className="mono mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default function OverviewPage() {
  const { device } = useApp();
  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
          Patient data stays on the device. Population intelligence lives in the cloud.
        </h1>
        <p className="max-w-2xl text-lg text-ink-2">
          OutbreakPulse turns a community health worker&apos;s field note into a structured, de-identified case record, even
          with no connection. County teams get cluster signals and a situation report without ever seeing a name.
        </p>
        <p className="text-sm text-ink-2">
          This device: <span className="font-medium text-ink">{DEVICE_LABELS[device]}</span>
        </p>
      </section>

      <section aria-labelledby="tiers-title">
        <h2 id="tiers-title" className="section-title">
          Three tiers, routed by data sensitivity
        </h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t.title} className="card">
              <h3 className="font-semibold">{t.title}</h3>
              <p className="mono mt-1 text-xs text-brand">{t.mode}</p>
              <p className="mt-2 text-[15px] text-ink-2">{t.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="workspace-title" className="grid gap-3">
        <h2 id="workspace-title" className="section-title">
          Your workspace
        </h2>
        <GuestGate>
          <Workspace />
        </GuestGate>
      </section>
    </div>
  );
}
