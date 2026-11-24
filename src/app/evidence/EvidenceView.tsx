"use client";

import { useMemo, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { DEVICE_LABELS } from "@/lib/ai/device";
import { describeAiError } from "@/lib/ai/errors";
import { prepareDeviceModel } from "@/lib/ai/models";
import { extractFromRawNote, extractFromScrubbedNote } from "@/lib/ai/tasks";
import { EVAL_NOTES, type EvalNote } from "@/lib/eval/dataset";
import {
  presentIdentifiers,
  runAiTier,
  runRulesTier,
  scoreOutcomes,
  TIER_LABELS,
  TIERS,
  type NoteOutcome,
  type Tier,
  type TierScore,
} from "@/lib/eval/evaluate";
import { HOLDOUT_NOTES } from "@/lib/eval/holdout";

const SETS = {
  development: { label: "Development set", notes: EVAL_NOTES, hint: "Used to tune the deterministic scrubber." },
  holdout: { label: "Held-out set", notes: HOLDOUT_NOTES, hint: "Written after tuning and never used to change code." },
} as const;
type SetKey = keyof typeof SETS;

type Runs = Partial<Record<`${SetKey}:${Tier}`, NoteOutcome[]>>;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const ms = (x: number | null) => (x === null ? "n/a" : `${x.toLocaleString("en-US")} ms`);

interface MetricRow {
  label: string;
  hint: string;
  value: (s: TierScore) => string;
  /** Rows where a non-zero value is a failure get a warning color. */
  bad?: (s: TierScore) => boolean;
}

const METRICS: MetricRow[] = [
  {
    label: "Identifiers removed",
    hint: "Planted names, phones, IDs and addresses absent from the de-identified note",
    value: (s) => `${s.piiRemoved} of ${s.piiPlanted}`,
    bad: (s) => s.piiRemoved < s.piiPlanted,
  },
  {
    label: "Identifiers sent to the cloud",
    hint: "Planted identifiers in any text that left the device",
    value: (s) => String(s.piiSentToCloud),
    bad: (s) => s.piiSentToCloud > 0,
  },
  {
    label: "Identifiers in stored summaries",
    hint: "Planted identifiers in the summary saved to Firestore",
    value: (s) => String(s.piiStored),
    bad: (s) => s.piiStored > 0,
  },
  { label: "Symptom F1", hint: "Agreement with the labelled symptoms", value: (s) => s.symptomF1.toFixed(2) },
  { label: "Danger sign F1", hint: "Agreement with the labelled danger signs", value: (s) => s.dangerSignF1.toFixed(2) },
  { label: "Age, sex and household fields", hint: "Share of these four fields that match the label", value: (s) => pct(s.fieldAccuracy) },
  { label: "Risk level matches", hint: "Rules engine on the extracted fields versus on the labels", value: (s) => pct(s.riskAgreement) },
  {
    label: "Under-triaged cases",
    hint: "Risk lower than the label before the health worker review: the unsafe error",
    value: (s) => String(s.underTriage),
    bad: (s) => s.underTriage > 0,
  },
  { label: "Suspected cholera status matches", hint: "GTFCC standard definition", value: (s) => pct(s.suspectedAgreement) },
  {
    label: "Where inference ran",
    hint: "Reported by Firebase AI Logic for each call",
    value: (s) =>
      [
        s.sources.on_device ? `${s.sources.on_device} on device` : null,
        s.sources.cloud ? `${s.sources.cloud} cloud` : null,
        s.sources.rules_only ? `${s.sources.rules_only} rules` : null,
      ]
        .filter(Boolean)
        .join(", "),
  },
  { label: "Median latency", hint: "Wall clock, per note", value: (s) => ms(s.latencyMedianMs) },
  { label: "95th percentile latency", hint: "Wall clock, per note", value: (s) => ms(s.latencyP95Ms) },
  { label: "Failed calls", hint: "Fell back to the rules engine", value: (s) => String(s.failed), bad: (s) => s.failed > 0 },
];

function NoteDetail({ note, outcome }: { note: EvalNote; outcome: NoteOutcome | undefined }) {
  const leaked = outcome ? presentIdentifiers(outcome.deidentifiedText, note.pii) : [];
  return (
    <li className="border-b border-line py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mono text-sm font-medium">{note.id}</span>
        {outcome && (
          <span className={`text-sm ${leaked.length > 0 ? "text-high" : "text-ink-2"}`}>
            {leaked.length > 0 ? `Left in the note: ${leaked.join(", ")}` : `${note.pii.length} of ${note.pii.length} identifiers removed`}
          </span>
        )}
        {outcome?.error && <span className="text-sm text-medium">{describeAiError(outcome.error)}</span>}
      </div>
      <p className="mt-1 text-[15px]">{note.text}</p>
      {outcome && <p className="mono mt-1 text-sm text-ink-2">{outcome.deidentifiedText}</p>}
    </li>
  );
}

export function EvidenceView() {
  const { device, online } = useApp();
  const [setKey, setSetKey] = useState<SetKey>("holdout");
  const [runs, setRuns] = useState<Runs>({});
  const [progress, setProgress] = useState<{ tier: Tier; done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailTier, setDetailTier] = useState<Tier>("rules");
  const stopRef = useRef(false);

  const notes = SETS[setKey].notes;
  const rulesOutcomes = useMemo(() => notes.map(runRulesTier), [notes]);
  const outcomesFor = (tier: Tier): NoteOutcome[] | undefined => (tier === "rules" ? rulesOutcomes : runs[`${setKey}:${tier}`]);
  const scores = Object.fromEntries(
    TIERS.map((t) => {
      const o = outcomesFor(t);
      return [t, o ? scoreOutcomes(notes, o) : null];
    }),
  ) as Record<Tier, TierScore | null>;

  async function run(tier: Exclude<Tier, "rules">) {
    setError(null);
    stopRef.current = false;
    if (tier === "on_device") {
      try {
        // Must run on the click that starts the evaluation.
        await prepareDeviceModel(() => {});
      } catch {
        // Already prepared; real failures surface per note.
      }
    }
    const deps = { extractFromRawNote, extractFromScrubbedNote };
    const out: NoteOutcome[] = [];
    setProgress({ tier, done: 0, total: notes.length });
    for (const note of notes) {
      if (stopRef.current) break;
      out.push(await runAiTier(tier, note, deps));
      setProgress({ tier, done: out.length, total: notes.length });
    }
    setProgress(null);
    if (out.length < notes.length) {
      setError("Stopped before the end. Results were not kept.");
      return;
    }
    setRuns((r) => ({ ...r, [`${setKey}:${tier}`]: out }));
    setDetailTier(tier);
  }

  const canRun: Record<Exclude<Tier, "rules">, { ok: boolean; why: string }> = {
    on_device: {
      ok: device === "available",
      why: device === "available" ? "Raw notes stay on this device." : `${DEVICE_LABELS[device]}. See System to enable Gemini Nano.`,
    },
    hybrid: {
      ok: online,
      why: online
        ? device === "available"
          ? "Runs on Gemini Nano here; on a device without it, the de-identified text goes to the cloud."
          : "Only the de-identified text is sent to the cloud model."
        : "Needs a connection.",
    },
  };

  const detailOutcomes = outcomesFor(detailTier);

  return (
    <div className="grid gap-4">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Evaluation set" className="flex flex-wrap gap-2">
          {(Object.keys(SETS) as SetKey[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={setKey === k}
              className={setKey === k ? "btn-primary" : "btn-secondary"}
              onClick={() => setSetKey(k)}
              disabled={progress !== null}
            >
              {`${SETS[k].label} (${SETS[k].notes.length} notes)`}
            </button>
          ))}
        </div>
        <p className="hint">
          {SETS[setKey].hint} <span className="mono">{notes.reduce((n, x) => n + x.pii.length, 0)}</span> planted identifiers.
        </p>
      </div>

      <section className="card overflow-x-auto" aria-labelledby="results-title">
        <h2 id="results-title" className="section-title">
          Results by tier
        </h2>
        <p className="hint mt-1">
          The deterministic tier is computed instantly on this device. The two AI tiers call Firebase AI Logic for real, one
          note at a time.
        </p>
        <table className="mt-3 w-full min-w-[720px] border-collapse text-left text-[15px]">
          <thead>
            <tr className="border-b border-line align-bottom">
              <th className="py-2 pr-3 text-sm font-medium text-ink-2">Metric</th>
              {TIERS.map((t) => (
                <th key={t} className="py-2 pr-3 font-medium">
                  {TIER_LABELS[t]}
                  {t !== "rules" && (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="btn-secondary px-3 text-sm"
                        disabled={!canRun[t].ok || progress !== null}
                        onClick={() => void run(t)}
                      >
                        {scores[t] ? "Run again" : "Run"}
                      </button>
                      <p className="hint mt-1 max-w-56 font-normal">{canRun[t].why}</p>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.label} className="border-b border-line align-top last:border-0">
                <td className="py-2.5 pr-3">
                  <div className="font-medium">{m.label}</div>
                  <div className="hint">{m.hint}</div>
                </td>
                {TIERS.map((t) => {
                  const s = scores[t];
                  return (
                    <td key={t} className={`mono py-2.5 pr-3 ${s && m.bad?.(s) ? "text-high" : ""}`}>
                      {s ? m.value(s) : <span className="font-sans text-ink-2">Not run</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {progress && (
          <div className="mt-3 flex flex-wrap items-center gap-3" role="status" aria-live="polite">
            <span className="hint">
              {TIER_LABELS[progress.tier]}: note <span className="mono">{progress.done}</span> of{" "}
              <span className="mono">{progress.total}</span>
            </span>
            <button type="button" className="btn-secondary px-3 text-sm" onClick={() => (stopRef.current = true)}>
              Stop
            </button>
          </div>
        )}
        {error && <p className="hint mt-3 text-medium">{error}</p>}
      </section>

      <section className="card" aria-labelledby="notes-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="notes-title" className="section-title">
            Notes and de-identified output
          </h2>
          <label className="flex items-center gap-2 text-sm">
            Tier
            <select className="input w-auto" value={detailTier} onChange={(e) => setDetailTier(e.target.value as Tier)}>
              {TIERS.filter((t) => outcomesFor(t)).map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul className="mt-2">
          {notes.map((n) => (
            <NoteDetail key={n.id} note={n} outcome={detailOutcomes?.find((o) => o.id === n.id)} />
          ))}
        </ul>
      </section>
    </div>
  );
}
