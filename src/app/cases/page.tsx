"use client";

import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { InferenceBadge, RiskBadge, SyncBadge } from "@/components/Badges";
import { GuestGate } from "@/components/GuestGate";
import { symptomLabel } from "@/lib/triage/vocabulary";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function CaseList() {
  const { cases, casesError, pendingSync } = useApp();

  if (casesError) {
    return (
      <p role="alert" className="rounded-md border border-high bg-high-surface px-3 py-2 text-sm text-high">
        Could not load cases: {casesError}
      </p>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="card-muted max-w-xl">
        <h2 className="section-title">No cases yet</h2>
        <p className="hint mt-1">Write a field report, or load the demo dataset from the overview page.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/triage/" className="btn-primary">
            New field report
          </Link>
          <Link href="/" className="btn-secondary">
            Overview
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="hint">
        <span className="mono">{cases.length}</span> cases, <span className="mono">{pendingSync}</span> waiting to sync.
      </p>
      <ul className="grid gap-3">
        {cases.map((c) => (
          <li key={c.caseId} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono text-[15px] font-medium">{c.caseId}</span>
                <RiskBadge level={c.riskLevel} />
                {c.suspectedCholera && (
                  <span className="inline-flex items-center rounded-md border border-high px-2 py-0.5 text-sm text-high">
                    Suspected cholera
                  </span>
                )}
                <SyncBadge pending={c.pendingSync} />
                {c.isDemo && <span className="hint">Demo</span>}
              </div>
              <span className="mono text-sm text-ink-2">{formatTime(c.clientCreatedAt)}</span>
            </div>
            <p className="mt-2 text-[15px]">{c.deidentifiedSummary}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-2">
              <span>{c.subCounty}</span>
              <span>{c.symptoms.map(symptomLabel).join(", ") || "No symptoms recorded"}</span>
              <InferenceBadge route={c.inferenceSource} latencyMs={c.latencyMs} />
              <span>
                <span className="mono">{c.redactionCount}</span> details removed
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CasesPage() {
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Cases</h1>
        <p className="mt-1 text-ink-2">De-identified records, including those saved offline and still waiting to sync.</p>
      </header>
      <GuestGate>
        <CaseList />
      </GuestGate>
    </div>
  );
}
