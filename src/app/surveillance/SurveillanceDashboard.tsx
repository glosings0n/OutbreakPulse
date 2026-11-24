"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { AlertBadge, InferenceBadge } from "@/components/Badges";
import { CountyMap } from "@/components/CountyMap";
import { EpiCurve } from "@/components/EpiCurve";
import { describeAiError } from "@/lib/ai/errors";
import type { AiSitrep } from "@/lib/ai/schemas";
import { generateSitrep } from "@/lib/ai/tasks";
import { saveSitrep } from "@/lib/firebase/firestore";
import { useNow } from "@/lib/hooks";
import { errorMessage } from "@/lib/result";
import { epiCurve } from "@/lib/surveillance/epicurve";
import { buildSnapshot, snapshotToModelInput } from "@/lib/surveillance/report";
import { COUNTY, SUB_COUNTIES } from "@/lib/triage/vocabulary";

interface ReportState {
  sitrep: AiSitrep;
  latencyMs: number;
  model: string;
  payload: string;
  savedId: string | null;
}

function Bars({ daily, windowDays }: { daily: number[]; windowDays: number }) {
  const max = Math.max(1, ...daily);
  const w = 6;
  const gap = 2;
  const h = 36;
  const recentStart = daily.length - windowDays;
  return (
    <svg
      width={daily.length * (w + gap)}
      height={h}
      role="img"
      aria-label={`Daily cases, last ${daily.length} days`}
      className="block"
    >
      {daily.map((v, i) => {
        const bh = v === 0 ? 1 : Math.max(3, (v / max) * h);
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={h - bh}
            width={w}
            height={bh}
            rx={1}
            fill={v === 0 ? "#e2e8f0" : i >= recentStart ? "#0f766e" : "#94a3b8"}
          />
        );
      })}
    </svg>
  );
}

export function SurveillanceDashboard() {
  const { user, cases, config, online, declaredOutbreaks, setOutbreakDeclared } = useApp();
  const [report, setReport] = useState<ReportState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPayload, setShowPayload] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const now = useNow();

  // Recomputed live: new cases and Remote Config threshold changes update the table immediately.
  const snapshot = useMemo(
    () =>
      buildSnapshot(
        cases.filter((c) => c.county === COUNTY),
        SUB_COUNTIES,
        {
          now,
          windowDays: config.windowDays,
          baselineDays: config.baselineDays,
          thresholds: config.thresholds,
          declared: declaredOutbreaks,
        },
      ),
    [cases, config, now, declaredOutbreaks],
  );

  const countyCases = useMemo(() => cases.filter((c) => c.county === COUNTY), [cases]);
  const curve = useMemo(
    () => epiCurve(countyCases, { now, days: config.windowDays + config.baselineDays, subCounty: focus }),
    [countyCases, now, config.windowDays, config.baselineDays, focus],
  );
  const statusBySub = Object.fromEntries(snapshot.statuses.map((s) => [s.subCounty, s.status]));

  const rows = [...snapshot.aggregates]
    .map((a) => ({
      agg: a,
      status: snapshot.statuses.find((s) => s.subCounty === a.subCounty) ?? { subCounty: a.subCounty, status: "NORMAL" as const, triggers: [] },
    }))
    .sort((x, y) => y.agg.recentCount - x.agg.recentCount);

  async function onGenerate() {
    if (!user) return;
    setBusy(true);
    setError(null);
    const payload = snapshotToModelInput(snapshot);
    const res = await generateSitrep({
      county: COUNTY,
      windowDays: config.windowDays,
      baselineDays: config.baselineDays,
      overallStatus: snapshot.overall,
      aggregateJson: payload,
      modelName: config.sitrepModel,
    });
    if (!res.ok) {
      setError(`The situation report could not be generated. ${describeAiError(res.error.message)} The deterministic alerts above remain valid.`);
      setBusy(false);
      return;
    }
    const next: ReportState = { sitrep: res.value, latencyMs: res.value.latencyMs, model: config.sitrepModel, payload, savedId: null };
    setReport(next);
    // The report is usable now; archiving waits for the server acknowledgement in the background.
    setBusy(false);
    try {
      const savedId = await saveSitrep({
        workspaceId: user.uid,
        county: COUNTY,
        generatedBy: user.uid,
        windowDays: config.windowDays,
        casesAnalyzed: snapshot.casesAnalyzed,
        alertStatus: snapshot.overall,
        aggregateInput: payload,
        executiveSummary: res.value.executiveSummary,
        hypotheses: res.value.hypotheses,
        recommendations: res.value.recommendations,
        model: config.sitrepModel,
        inferenceSource: "cloud",
        latencyMs: res.value.latencyMs,
      });
      setReport({ ...next, savedId });
    } catch (e) {
      setError(`Report generated but not saved: ${errorMessage(e)}`);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="section-title">{COUNTY}</h2>
            <AlertBadge status={snapshot.overall} />
          </div>
          <p className="hint mt-1">
            Last <span className="mono">{config.windowDays}</span> days against the previous <span className="mono">{config.baselineDays}</span>.
            Thresholds: watch <span className="mono">{config.thresholds.watch}</span>, critical{" "}
            <span className="mono">{config.thresholds.critical}</span> cases ({config.source === "remote" ? "Remote Config" : "defaults"}).
          </p>
        </div>
        <p className="hint">
          <span className="mono">{snapshot.casesAnalyzed}</span> cases analyzed
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="card" aria-labelledby="map-title">
          <h2 id="map-title" className="section-title">
            County map
          </h2>
          <p className="hint mt-1">Select a sub-county to filter the curve. Schematic map of a fictional county.</p>
          <div className="mt-3">
            <CountyMap statuses={statusBySub} declared={snapshot.declared} selected={focus} onSelect={setFocus} />
          </div>
        </section>
        <section className="card" aria-labelledby="curve-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="curve-title" className="section-title">
              Epidemic curve, {focus ?? "whole county"}
            </h2>
            {focus && (
              <button type="button" className="text-sm text-brand underline" onClick={() => setFocus(null)}>
                Show the whole county
              </button>
            )}
          </div>
          <p className="hint mt-1">Cases by day of symptom onset over the last <span className="mono">{config.windowDays + config.baselineDays}</span> days.</p>
          <div className="mt-3">
            <EpiCurve days={curve} windowDays={config.windowDays} title={`Epidemic curve, ${focus ?? "whole county"}`} />
          </div>
        </section>
      </div>

      <section className="card overflow-x-auto" aria-labelledby="table-title">
        <h2 id="table-title" className="section-title">
          Sub-county signals
        </h2>
        <p className="hint mt-1">
          Computed deterministically on this device from de-identified records. Suspected cholera follows the GTFCC case
          definitions. Declaring an outbreak in a sub-county switches field triage there to the outbreak definition, where
          every case of acute watery diarrhoea counts as suspected cholera.
        </p>
        <table className="mt-3 w-full min-w-[760px] border-collapse text-left text-[15px]">
          <thead>
            <tr className="border-b border-line text-sm text-ink-2">
              <th className="py-2 pr-3 font-medium">Sub-county</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 text-right font-medium">Recent</th>
              <th className="py-2 pr-3 text-right font-medium">Suspected cholera</th>
              <th className="py-2 pr-3 text-right font-medium">High risk</th>
              <th className="py-2 pr-3 text-right font-medium">Rate vs baseline</th>
              <th className="py-2 pr-3 font-medium">Daily cases</th>
              <th className="py-2 font-medium">Outbreak</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ agg, status }) => {
              const declared = snapshot.declared.includes(agg.subCounty);
              return (
              <tr key={agg.subCounty} className="border-b border-line align-top last:border-0">
                <td className="py-3 pr-3 font-medium">
                  {agg.subCounty}
                  {status.triggers.length > 0 && <div className="mt-1 text-sm font-normal text-ink-2">{status.triggers.join(". ")}</div>}
                </td>
                <td className="py-3 pr-3">
                  <AlertBadge status={status.status} />
                </td>
                <td className="mono py-3 pr-3 text-right">{agg.recentCount}</td>
                <td className="mono py-3 pr-3 text-right">{agg.suspectedRecent}</td>
                <td className="mono py-3 pr-3 text-right">{agg.highRiskRecent}</td>
                <td className="mono py-3 pr-3 text-right">{agg.rateRatio.toFixed(1)}x</td>
                <td className="py-3 pr-3">
                  <Bars daily={agg.daily} windowDays={config.windowDays} />
                </td>
                <td className="py-3">
                  {declared && <p className="mb-1 text-sm font-medium text-high">Declared</p>}
                  <button
                    type="button"
                    className="btn-secondary whitespace-nowrap px-3 text-sm"
                    disabled={!user}
                    aria-label={`${declared ? "End the outbreak declaration in" : "Declare an outbreak in"} ${agg.subCounty}`}
                    onClick={() => setOutbreakDeclared(agg.subCounty, !declared)}
                  >
                    {declared ? "End declaration" : "Declare"}
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card" aria-labelledby="sitrep-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="sitrep-title" className="section-title">
              Situation report
            </h2>
            <p className="hint mt-1">Drafted in the cloud from the aggregate table only. No case text or identifiers are sent.</p>
          </div>
          <button type="button" className="btn-primary" disabled={busy || !online || snapshot.casesAnalyzed === 0} onClick={() => void onGenerate()}>
            {busy ? "Drafting..." : "Generate SitRep"}
          </button>
        </div>
        {!online && <p className="hint mt-3">The situation report needs a connection. Signals above keep working offline.</p>}
        {error && (
          <p role="alert" className="mt-3 rounded-md border border-high bg-high-surface px-3 py-2 text-sm text-high">
            {error}
          </p>
        )}
        {report && (
          <div className="mt-4 grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <InferenceBadge route="cloud" latencyMs={report.latencyMs} />
              <span className="mono text-sm text-ink-2">{report.model}</span>
              <span className="hint">{report.savedId ? "Saved to the report archive" : "Saving to the report archive..."}</span>
            </div>
            <p className="text-[15px] leading-relaxed">{report.sitrep.executiveSummary}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium">Hypotheses to investigate</h3>
                <ul className="mt-2 grid gap-1.5 text-[15px]">
                  {report.sitrep.hypotheses.map((h) => (
                    <li key={h} className="border-l-2 border-line pl-3">
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-medium">Recommended response</h3>
                <ol className="mt-2 grid list-decimal gap-1.5 pl-5 text-[15px]">
                  {report.sitrep.recommendations.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
              </div>
            </div>
            <div>
              <button type="button" className="text-sm text-brand underline" onClick={() => setShowPayload((v) => !v)} aria-expanded={showPayload}>
                {showPayload ? "Hide" : "Show"} exactly what was sent to the cloud
              </button>
              {showPayload && (
                <pre className="mono mt-2 max-h-72 overflow-auto rounded-md border border-line bg-surface p-3 text-xs">
                  {JSON.stringify(JSON.parse(report.payload), null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
