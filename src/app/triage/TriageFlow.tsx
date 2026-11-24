"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { InferenceBadge, RiskBadge, SyncBadge } from "@/components/Badges";
import { PrivacyBoundary } from "@/components/PrivacyBoundary";
import { DEVICE_LABELS } from "@/lib/ai/device";
import { describeAiError } from "@/lib/ai/errors";
import { prepareDeviceModel } from "@/lib/ai/models";
import { extractFromRawNote, extractFromScrubbedNote } from "@/lib/ai/tasks";
import { SAMPLE_NOTES } from "@/lib/demo/sample-notes";
import { saveCase } from "@/lib/firebase/firestore";
import { newCaseId } from "@/lib/ids";
import { enqueueEnrichment } from "@/lib/offline/queue";
import { errorMessage } from "@/lib/result";
import type { ExtractedFields } from "@/lib/triage/extract";
import {
  analyzeNote,
  buildCaseRecord,
  decideRoute,
  MAX_NOTE_LENGTH,
  prepareNote,
  type Draft,
  type PreparedNote,
} from "@/lib/triage/pipeline";
import { actionsFor, evaluateRules, mergeRisk } from "@/lib/triage/rules";
import {
  AGE_BANDS,
  COUNTY,
  DANGER_SIGNS,
  SEXES,
  SUB_COUNTIES,
  SYMPTOMS,
  type DangerSignCode,
  type SubCounty,
  type SymptomCode,
} from "@/lib/triage/vocabulary";

type Step =
  | { name: "compose" }
  | { name: "analyzing"; label: string }
  | { name: "consent"; prepared: PreparedNote }
  | { name: "review"; draft: Draft }
  | { name: "saved"; caseId: string; riskLevel: "LOW" | "MEDIUM" | "HIGH"; queued: boolean };

const AGE_LABELS: Record<(typeof AGE_BANDS)[number], string> = {
  "0-4": "Under 5",
  "5-14": "5 to 14",
  "15-49": "15 to 49",
  "50+": "50 and over",
  unknown: "Unknown",
};

const SEX_LABELS: Record<(typeof SEXES)[number], string> = { female: "Female", male: "Male", unknown: "Unknown" };

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function TriageFlow() {
  const { user, online, device, config, cases, refreshQueue } = useApp();
  const [note, setNote] = useState("");
  const [subCounty, setSubCounty] = useState<SubCounty>("Riverside");
  const [step, setStep] = useState<Step>({ name: "compose" });
  const [fields, setFields] = useState<ExtractedFields | null>(null);
  const [queueForAi, setQueueForAi] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const deps = useMemo(
    () => ({
      extractFromRawNote: async (raw: string) => {
        // initializeDeviceModel must run on a user gesture and before the first prompt.
        try {
          await prepareDeviceModel(() => {});
        } catch {
          // Already initialized or not needed; the call below reports real failures.
        }
        return extractFromRawNote(raw);
      },
      extractFromScrubbedNote,
    }),
    [],
  );

  async function runAnalysis(prepared: PreparedNote, cloudConsent: boolean | null) {
    const decision = decideRoute({ device, online, cloudConsent, privacyGateRequired: config.privacyGateRequired });
    if (decision.kind === "needs_consent") {
      setStep({ name: "consent", prepared });
      return;
    }
    setStep({
      name: "analyzing",
      label:
        decision.kind === "on_device"
          ? "Analyzing on this device with Gemini Nano..."
          : decision.kind === "cloud"
            ? "Analyzing the de-identified note..."
            : "Analyzing with the local rules engine...",
    });
    const draft = await analyzeNote(note, prepared, decision, deps);
    setFields({ ...draft.fields, subCounty: draft.fields.subCounty ?? subCounty });
    if (draft.fields.subCounty) setSubCounty(draft.fields.subCounty);
    setQueueForAi(draft.route === "rules_only");
    setStep({ name: "review", draft });
  }

  function onAnalyze() {
    setError(null);
    if (note.trim().length < 10) {
      setError("Write a few words about the patient first.");
      return;
    }
    void runAnalysis(prepareNote(note), null);
  }

  async function onSave(draft: Draft) {
    if (!user || !fields) return;
    setError(null);
    try {
      const record = buildCaseRecord({
        caseId: newCaseId(),
        workspaceId: user.uid,
        agentUid: user.uid,
        county: COUNTY,
        subCounty,
        fields,
        summary: draft.summary,
        route: draft.route,
        latencyMs: draft.latencyMs,
        redactionCount: draft.redactionCount,
        aiRisk: draft.aiRisk,
        now: Date.now(),
      });
      // Not awaited: Firestore queues the write locally and syncs when online.
      const { serverAck } = saveCase(record);
      serverAck.catch(() => {
        // Rejected writes surface in the Cases view through their missing sync state.
      });

      let queued = false;
      if (draft.route === "rules_only" && queueForAi) {
        const scrubbed = prepareNote(note).scrubbedText;
        await enqueueEnrichment({ caseId: record.caseId, scrubbedNote: scrubbed, fields: { ...fields, subCounty } });
        queued = true;
        await refreshQueue();
      }

      setNote("");
      setStep({ name: "saved", caseId: record.caseId, riskLevel: record.riskLevel, queued });
    } catch (e) {
      setError(`Could not save the case: ${errorMessage(e)}`);
    }
  }

  function reset() {
    setNote("");
    setFields(null);
    setError(null);
    setStep({ name: "compose" });
  }

  const deviceNote =
    device === "available"
      ? "Gemini Nano is ready. Notes are analyzed on this device."
      : `${DEVICE_LABELS[device]}. ${online ? "Only a de-identified version can be analyzed in the cloud, with your consent." : "Offline: the local rules engine will be used."}`;

  // ---------- Saved ----------
  if (step.name === "saved") {
    const saved = cases.find((c) => c.caseId === step.caseId);
    return (
      <div className="card max-w-2xl">
        <h2 className="section-title">Case saved</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mono text-[15px]">{step.caseId}</span>
          <RiskBadge level={saved?.riskLevel ?? step.riskLevel} />
          <SyncBadge pending={saved ? saved.pendingSync : !online} />
        </div>
        <p className="hint mt-3">
          {online
            ? "The de-identified record is being synced to the county."
            : "You are offline. The record is stored on this device and will sync automatically when the connection returns."}
          {step.queued && " The de-identified note will get an AI review once online."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={reset}>
            New field report
          </button>
          <Link href="/cases/" className="btn-secondary">
            View cases
          </Link>
        </div>
      </div>
    );
  }

  // ---------- Consent gate ----------
  if (step.name === "consent") {
    return (
      <div className="grid max-w-3xl gap-4">
        <div className="card">
          <h2 className="section-title">Cloud analysis needs your approval</h2>
          <p className="hint mt-2">
            Gemini Nano is not available on this device, so the note cannot be analyzed locally. Personal details have been
            removed below. Only this de-identified text would be sent to the cloud model.
          </p>
          <pre className="mono mt-3 whitespace-pre-wrap break-words rounded-md border border-medium bg-medium-surface p-3 text-sm">
            {step.prepared.scrubbedText}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => void runAnalysis(step.prepared, true)}>
              Send de-identified text
            </button>
            <button type="button" className="btn-secondary" onClick={() => void runAnalysis(step.prepared, false)}>
              Use local rules only
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Review ----------
  if (step.name === "review" && fields) {
    const { draft } = step;
    const rules = evaluateRules(fields);
    const merged = mergeRisk(rules, draft.aiRisk);
    return (
      <div className="grid gap-4">
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <InferenceBadge route={draft.route} latencyMs={draft.latencyMs} />
            {draft.aiError && (
              <span className="hint" title={draft.aiError}>
                {describeAiError(draft.aiError)} Rules engine used.
              </span>
            )}
          </div>
          <RiskBadge level={merged.riskLevel} size="lg" />
        </div>

        <PrivacyBoundary
          route={draft.route}
          rawNote={note}
          cloudPayload={draft.cloudPayload}
          redactionCount={draft.redactionCount}
          queuedForLater={draft.route === "rules_only" && queueForAi}
        />

        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <section className="card" aria-labelledby="fields-title">
            <h2 id="fields-title" className="section-title">
              Review the case
            </h2>
            <p className="hint mt-1">Pre-filled from the note. Correct anything that is wrong before saving.</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="sub-county">
                  Sub-county
                </label>
                <select id="sub-county" className="input" value={subCounty} onChange={(e) => setSubCounty(e.target.value as SubCounty)}>
                  {SUB_COUNTIES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="age-band">
                  Age
                </label>
                <select
                  id="age-band"
                  className="input"
                  value={fields.ageBand}
                  onChange={(e) => setFields({ ...fields, ageBand: e.target.value as ExtractedFields["ageBand"] })}
                >
                  {AGE_BANDS.map((a) => (
                    <option key={a} value={a}>
                      {AGE_LABELS[a]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="sex">
                  Sex
                </label>
                <select
                  id="sex"
                  className="input"
                  value={fields.sex}
                  onChange={(e) => setFields({ ...fields, sex: e.target.value as ExtractedFields["sex"] })}
                >
                  {SEXES.map((s) => (
                    <option key={s} value={s}>
                      {SEX_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="mt-5">
              <legend className="label">Symptoms</legend>
              <div className="flex flex-wrap gap-2">
                {SYMPTOMS.map((s) => (
                  <Chip
                    key={s.code}
                    label={s.label}
                    selected={fields.symptoms.includes(s.code)}
                    onToggle={() => setFields({ ...fields, symptoms: toggle<SymptomCode>(fields.symptoms, s.code) })}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <legend className="label">Danger signs</legend>
              <div className="flex flex-wrap gap-2">
                {DANGER_SIGNS.map((d) => (
                  <Chip
                    key={d.code}
                    label={d.label}
                    danger
                    selected={fields.dangerSigns.includes(d.code)}
                    onToggle={() => setFields({ ...fields, dangerSigns: toggle<DangerSignCode>(fields.dangerSigns, d.code) })}
                  />
                ))}
              </div>
            </fieldset>

            <div className="mt-5 grid gap-2">
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[#0f766e]"
                  checked={fields.householdContact}
                  onChange={(e) => setFields({ ...fields, householdContact: e.target.checked })}
                />
                Someone else in the household is sick
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[#0f766e]"
                  checked={fields.householdDeath}
                  onChange={(e) => setFields({ ...fields, householdDeath: e.target.checked })}
                />
                Recent death in the household
              </label>
            </div>
          </section>

          <section className="card" aria-labelledby="decision-title">
            <h2 id="decision-title" className="section-title">
              Risk and actions
            </h2>
            <p className="hint mt-1">Set by the rules engine. AI can raise the level with a reason, never lower it.</p>
            <ul className="mt-3 grid gap-1.5 text-[15px]">
              {merged.reasons.map((r) => (
                <li key={r} className="border-l-2 border-line pl-3">
                  {r}
                </li>
              ))}
            </ul>
            <h3 className="mt-4 text-sm font-medium">Recommended actions</h3>
            <ol className="mt-2 grid list-decimal gap-1.5 pl-5 text-[15px]">
              {actionsFor(merged.riskLevel).map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ol>
            <h3 className="mt-4 text-sm font-medium">De-identified summary</h3>
            <p className="mt-1 text-[15px] text-ink-2">{draft.summary}</p>
          </section>
        </div>

        <div className="card flex flex-wrap items-center justify-between gap-3">
          {draft.route === "rules_only" ? (
            <label className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="h-5 w-5 accent-[#0f766e]" checked={queueForAi} onChange={(e) => setQueueForAi(e.target.checked)} />
              Queue the de-identified note for AI review when online
            </label>
          ) : (
            <span className="hint">Only the de-identified record above will be stored.</span>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={reset}>
              Discard
            </button>
            <button type="button" className="btn-primary" onClick={() => void onSave(draft)}>
              Save case
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-md border border-high bg-high-surface px-3 py-2 text-sm text-high">
            {error}
          </p>
        )}
      </div>
    );
  }

  // ---------- Compose / analyzing ----------
  const analyzing = step.name === "analyzing";
  return (
    <div className="grid max-w-3xl gap-4">
      <div className={`rounded-md border px-3 py-2 text-sm ${device === "available" ? "border-brand bg-brand-surface text-brand" : "border-line bg-surface text-ink-2"}`}>
        {deviceNote}
      </div>
      <div className="card">
        <label htmlFor="note" className="label">
          Field note
        </label>
        <p className="hint mb-2">Write naturally, as you would in your notebook. Names and phone numbers are removed before anything is stored.</p>
        <textarea
          id="note"
          className="input min-h-40 resize-y leading-relaxed"
          maxLength={MAX_NOTE_LENGTH}
          value={note}
          disabled={analyzing}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Example: Visited a 7 year old boy near the river market, watery diarrhoea and vomiting for 2 days, sunken eyes..."
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="hint">Try a sample:</span>
          {SAMPLE_NOTES.map((s) => (
            <button
              key={s.label}
              type="button"
              className="rounded-md border border-line px-2.5 py-1 text-sm text-ink hover:bg-surface"
              disabled={analyzing}
              onClick={() => {
                setNote(s.text);
                setSubCounty(s.subCounty);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="compose-sub-county">
              Sub-county
            </label>
            <select id="compose-sub-county" className="input" value={subCounty} disabled={analyzing} onChange={(e) => setSubCounty(e.target.value as SubCounty)}>
              {SUB_COUNTIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-primary" disabled={analyzing} onClick={onAnalyze}>
            {analyzing ? "Analyzing..." : "Analyze note"}
          </button>
        </div>
        {analyzing && (
          <p className="hint mt-3" role="status">
            {step.label}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-md border border-high bg-high-surface px-3 py-2 text-sm text-high">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function Chip({ label, selected, danger, onToggle }: { label: string; selected: boolean; danger?: boolean; onToggle: () => void }) {
  const on = danger ? "border-high bg-high-surface text-high" : "border-brand bg-brand-surface text-brand";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`min-h-11 rounded-md border px-3 text-sm ${selected ? `${on} font-medium` : "border-line bg-bg text-ink hover:bg-surface"}`}
    >
      {label}
    </button>
  );
}
