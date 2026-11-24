/**
 * Measures each inference tier on the evaluation set. Pure: AI calls are injected,
 * so the deterministic tier runs in unit tests and the AI tiers run in the browser.
 *
 * Metrics:
 * - identifiers removed: planted identifiers absent from the de-identified note.
 * - identifiers sent to the cloud: planted identifiers present in any text that leaves the device.
 * - identifiers stored: planted identifiers present in the stored summary.
 * - symptom and danger sign F1 (micro), field accuracy (age band, sex, household contact, household death).
 * - risk agreement with the ground truth risk, under-triage (a lower risk than the truth: the unsafe error),
 *   and agreement on the suspected cholera status.
 */
import type { AiExtraction } from "@/lib/ai/schemas";
import type { AiMeta } from "@/lib/ai/tasks";
import type { Result } from "@/lib/result";
import { deterministicSummary, mergeFields, prepareNote, sanitizeSummary } from "@/lib/triage/pipeline";
import { applyPiiStrings } from "@/lib/triage/redact";
import { evaluateRules, mergeRisk, RISK_ORDER } from "@/lib/triage/rules";
import type { RiskLevel } from "@/lib/triage/vocabulary";
import type { EvalNote, TruthFields } from "./dataset";

export const TIERS = ["rules", "on_device", "hybrid"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<Tier, string> = {
  rules: "Scrubber and keywords",
  on_device: "Gemini Nano, raw note",
  hybrid: "Hybrid model, de-identified note",
};

export interface NoteOutcome {
  id: string;
  fields: TruthFields;
  /** De-identified note text after every redaction pass. */
  deidentifiedText: string;
  /** Text that left the device for this note, or null when nothing did. */
  outboundText: string | null;
  summary: string;
  aiRisk: { riskLevel: RiskLevel; reason: string } | null;
  source: "rules_only" | "on_device" | "cloud";
  latencyMs: number | null;
  error: string | null;
}

export interface EvalDeps {
  extractFromRawNote(note: string): Promise<Result<AiExtraction & AiMeta>>;
  extractFromScrubbedNote(note: string): Promise<Result<AiExtraction & AiMeta>>;
}

function pick(f: TruthFields): TruthFields {
  return {
    ageBand: f.ageBand,
    sex: f.sex,
    symptoms: [...f.symptoms],
    dangerSigns: [...f.dangerSigns],
    householdContact: f.householdContact,
    householdDeath: f.householdDeath,
  };
}

/** The deterministic tier: what the app does with no AI at all. */
export function runRulesTier(note: EvalNote): NoteOutcome {
  const prepared = prepareNote(note.text);
  return {
    id: note.id,
    fields: pick(prepared.keywordFields),
    deidentifiedText: prepared.scrubbedText,
    // Offline notes are queued and their scrubbed text is sent for AI review later.
    outboundText: prepared.scrubbedText,
    summary: deterministicSummary(prepared.keywordFields),
    aiRisk: null,
    source: "rules_only",
    latencyMs: null,
    error: null,
  };
}

export async function runAiTier(tier: Exclude<Tier, "rules">, note: EvalNote, deps: EvalDeps): Promise<NoteOutcome> {
  const prepared = prepareNote(note.text);
  const res = tier === "on_device" ? await deps.extractFromRawNote(note.text) : await deps.extractFromScrubbedNote(prepared.scrubbedText);
  if (!res.ok) {
    const fallback = runRulesTier(note);
    return { ...fallback, outboundText: tier === "hybrid" ? prepared.scrubbedText : null, error: res.error.message };
  }
  const ai = res.value;
  const deidentified = applyPiiStrings(prepared.scrubbedText, ai.piiStrings).text;
  const fields = mergeFields(prepared.keywordFields, ai);
  return {
    id: note.id,
    fields: pick(fields),
    deidentifiedText: deidentified,
    outboundText: ai.source === "cloud" ? prepared.scrubbedText : null,
    summary: sanitizeSummary(ai.summary, ai.piiStrings).text || deterministicSummary(fields),
    aiRisk: { riskLevel: ai.riskOpinion, reason: ai.riskReason },
    source: ai.source,
    latencyMs: ai.latencyMs,
    error: null,
  };
}

/** Case-insensitive: a planted identifier counts as present if it survives anywhere in the text. */
export function presentIdentifiers(text: string | null, pii: readonly string[]): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return pii.filter((p) => lower.includes(p.toLowerCase()));
}

interface Counts {
  tp: number;
  fp: number;
  fn: number;
}

function setCounts<T>(truth: readonly T[], predicted: readonly T[]): Counts {
  const t = new Set(truth);
  const p = new Set(predicted);
  let tp = 0;
  for (const x of p) if (t.has(x)) tp += 1;
  return { tp, fp: p.size - tp, fn: t.size - tp };
}

function f1(c: Counts): number {
  const denom = 2 * c.tp + c.fp + c.fn;
  return denom === 0 ? 1 : (2 * c.tp) / denom;
}

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

export interface TierScore {
  notes: number;
  failed: number;
  sources: Record<NoteOutcome["source"], number>;
  piiPlanted: number;
  piiRemoved: number;
  piiSentToCloud: number;
  piiStored: number;
  symptomF1: number;
  dangerSignF1: number;
  fieldAccuracy: number;
  riskAgreement: number;
  underTriage: number;
  suspectedAgreement: number;
  latencyMedianMs: number | null;
  latencyP95Ms: number | null;
}

export function scoreOutcomes(notes: readonly EvalNote[], outcomes: readonly NoteOutcome[]): TierScore {
  const byId = new Map(outcomes.map((o) => [o.id, o]));
  const symptom: Counts = { tp: 0, fp: 0, fn: 0 };
  const danger: Counts = { tp: 0, fp: 0, fn: 0 };
  const sources: TierScore["sources"] = { rules_only: 0, on_device: 0, cloud: 0 };
  let scored = 0;
  let failed = 0;
  let piiPlanted = 0;
  let piiRemoved = 0;
  let piiSentToCloud = 0;
  let piiStored = 0;
  let fieldHits = 0;
  let riskHits = 0;
  let underTriage = 0;
  let suspectedHits = 0;
  const latencies: number[] = [];

  for (const note of notes) {
    const o = byId.get(note.id);
    if (!o) continue;
    scored += 1;
    if (o.error) failed += 1;
    sources[o.source] += 1;
    if (o.latencyMs !== null) latencies.push(o.latencyMs);

    piiPlanted += note.pii.length;
    piiRemoved += note.pii.length - presentIdentifiers(o.deidentifiedText, note.pii).length;
    piiSentToCloud += presentIdentifiers(o.outboundText, note.pii).length;
    piiStored += presentIdentifiers(o.summary, note.pii).length;

    const s = setCounts(note.truth.symptoms, o.fields.symptoms);
    const d = setCounts(note.truth.dangerSigns, o.fields.dangerSigns);
    symptom.tp += s.tp;
    symptom.fp += s.fp;
    symptom.fn += s.fn;
    danger.tp += d.tp;
    danger.fp += d.fp;
    danger.fn += d.fn;

    fieldHits +=
      Number(o.fields.ageBand === note.truth.ageBand) +
      Number(o.fields.sex === note.truth.sex) +
      Number(o.fields.householdContact === note.truth.householdContact) +
      Number(o.fields.householdDeath === note.truth.householdDeath);

    const truthRules = evaluateRules({ ...note.truth, onsetDaysAgo: null });
    const predictedRules = evaluateRules({ ...o.fields, onsetDaysAgo: null });
    const predicted = mergeRisk(predictedRules, o.aiRisk).riskLevel;
    if (predicted === truthRules.riskLevel) riskHits += 1;
    if (RISK_ORDER[predicted] < RISK_ORDER[truthRules.riskLevel]) underTriage += 1;
    if (predictedRules.meetsSuspectedCaseDefinition === truthRules.meetsSuspectedCaseDefinition) suspectedHits += 1;
  }

  latencies.sort((a, b) => a - b);
  const ratio = (n: number, d: number) => (d === 0 ? 0 : n / d);
  return {
    notes: scored,
    failed,
    sources,
    piiPlanted,
    piiRemoved,
    piiSentToCloud,
    piiStored,
    symptomF1: f1(symptom),
    dangerSignF1: f1(danger),
    fieldAccuracy: ratio(fieldHits, scored * 4),
    riskAgreement: ratio(riskHits, scored),
    underTriage,
    suspectedAgreement: ratio(suspectedHits, scored),
    latencyMedianMs: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
  };
}
