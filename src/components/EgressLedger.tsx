"use client";

import { useEffect, useState } from "react";
import { egressTotals, subscribeEgress, type EgressEntry } from "@/lib/egress/ledger";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Entry({ e }: { e: EgressEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-line py-2.5 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <span className={`text-sm font-medium ${e.leftDevice ? "text-ink" : "text-brand"}`}>{e.destination}</span>
          <p className="text-[15px]">{e.description}</p>
        </div>
        <div className="flex items-baseline gap-3 text-sm text-ink-2">
          <span className="mono">{e.leftDevice ? formatBytes(e.bytes) : "0 B, stayed here"}</span>
          <span className="mono">{formatTime(e.at)}</span>
        </div>
      </div>
      {e.detail && (
        <>
          <button type="button" className="mt-1 text-sm text-brand underline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Show"} the exact content sent
          </button>
          {open && (
            <pre className="mono mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface p-2 text-xs">
              {e.detail}
            </pre>
          )}
        </>
      )}
    </li>
  );
}

/** Lists what this app sent off the device during the session, and the AI calls that stayed on it. */
export function EgressLedger() {
  const [entries, setEntries] = useState<readonly EgressEntry[]>([]);
  useEffect(() => subscribeEgress(setEntries), []);
  const totals = egressTotals(entries);

  return (
    <section className="card" aria-labelledby="egress-title">
      <h2 id="egress-title" className="section-title">
        What left this device
      </h2>
      <p className="hint mt-1">
        Every piece of content this app sent during this session, and every AI call that stayed on the device. Raw notes and
        photos never appear here because they never leave. Firebase control traffic (sign-in, App Check tokens,
        configuration) carries no case content and is not listed. The ledger is kept in memory and cleared on reload.
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-md border border-line p-3">
          <dt className="hint">Sent off the device</dt>
          <dd className="mono mt-1 text-lg">{formatBytes(totals.bytesOut)}</dd>
        </div>
        <div className="rounded-md border border-line p-3">
          <dt className="hint">Outbound requests</dt>
          <dd className="mono mt-1 text-lg">{totals.requestsOut}</dd>
        </div>
        <div className="rounded-md border border-line p-3">
          <dt className="hint">AI calls kept on device</dt>
          <dd className="mono mt-1 text-lg">{totals.onDeviceCalls}</dd>
        </div>
      </dl>
      {entries.length === 0 ? (
        <p className="hint mt-3">Nothing yet. Analyze a note, save a case or generate a situation report, then come back.</p>
      ) : (
        <ul className="mt-2">
          {entries.map((e) => (
            <Entry key={e.id} e={e} />
          ))}
        </ul>
      )}
    </section>
  );
}
