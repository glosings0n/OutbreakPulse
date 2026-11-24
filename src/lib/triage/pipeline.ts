/**
 * Field note pipeline: privacy-routed hybrid inference.
 *
 *   raw note -> deterministic scrub (always) -> route decision ->
 *     on_device : raw note to Gemini Nano (ONLY_ON_DEVICE), extra PII spans applied
 *     cloud     : scrubbed note to the hybrid model (PREFER_ON_DEVICE), after consent
 *     rules_only: keyword extraction, AI enrichment queued for later
 *   -> health worker reviews fields -> rules engine sets the risk floor -> de-identified record
 *
 * AI calls are injected so this module stays pure and testable.
 */
import type { DeviceAvailability } from "@/lib/ai/device";
import type { AiExtraction } from "@/lib/ai/schemas";
import type { AiMeta } from "@/lib/ai/tasks";
import type { CaseRecord, InferenceRoute } from "@/lib/cases/types";
import type { Result } from "@/lib/result";
import { extractByKeywords, type ExtractedFields } from "./extract";
import { applyPiiStrings, scrubDeterministic } from "./redact";
import { actionsFor, evaluateRules, mergeRisk, type AiRiskOpinion } from "./rules";
import { dangerSignLabel, symptomLabel, type SubCounty } from "./vocabulary";

export const MAX_NOTE_LENGTH = 2000;
export const MAX_SUMMARY_LENGTH = 280;

export interface PreparedNote {
  scrubbedText: string;
  redactionCount: number;
  keywordFields: ExtractedFields;
}

export function prepareNote(raw: string): PreparedNote {
  const scrub = scrubDeterministic(raw.slice(0, MAX_NOTE_LENGTH));
  return {
    scrubbedText: scrub.text,
    redactionCount: scrub.redactions.length,
    keywordFields: extractByKeywords(scrub.text),
  };
}

export type RouteDecision =
  | { kind: "on_device" }
  | { kind: "cloud" }
  | { kind: "needs_consent" }
  | { kind: "rules_only"; reason: "offline" | "declined" };

export interface RouteContext {
  device: DeviceAvailability;
  online: boolean;
  /** null means the health worker has not been asked yet. */
  cloudConsent: boolean | null;
  privacyGateRequired: boolean;
}

export function decideRoute(ctx: RouteContext): RouteDecision {
  if (ctx.device === "available") return { kind: "on_device" };
  if (!ctx.online) return { kind: "rules_only", reason: "offline" };
  if (!ctx.privacyGateRequired) return { kind: "cloud" };
  if (ctx.cloudConsent === null) return { kind: "needs_consent" };
  return ctx.cloudConsent ? { kind: "cloud" } : { kind: "rules_only", reason: "declined" };
}

export interface AiDeps {
  extractFromRawNote(note: string): Promise<Result<AiExtraction & AiMeta>>;
  extractFromScrubbedNote(note: string): Promise<Result<AiExtraction & AiMeta>>;
}

export interface Draft {
  fields: ExtractedFields;
  summary: string;
  route: InferenceRoute;
  latencyMs: number | null;
  redactionCount: number;
  /** Exactly what would be or was sent to the cloud. Never contains the raw note. */
  cloudPayload: string | null;
  aiRisk: AiRiskOpinion | null;
  aiError: string | null;
}

function uniq<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function mergeFields(keyword: ExtractedFields, ai: AiExtraction): ExtractedFields {
  return {
    ageBand: ai.ageBand !== "unknown" ? ai.ageBand : keyword.ageBand,
    sex: ai.sex !== "unknown" ? ai.sex : keyword.sex,
    onsetDaysAgo: ai.onsetDaysAgo >= 0 ? Math.min(ai.onsetDaysAgo, 60) : keyword.onsetDaysAgo,
    symptoms: uniq([...keyword.symptoms, ...ai.symptoms]),
    dangerSigns: uniq([...keyword.dangerSigns, ...ai.dangerSigns]),
    householdContact: keyword.householdContact || ai.householdContact,
    householdDeath: keyword.householdDeath || ai.householdDeath,
    subCounty: keyword.subCounty,
  };
}

/** Removes anything identifying from model-written text and bounds its length. */
export function sanitizeSummary(summary: string, piiStrings: readonly string[]): { text: string; removed: number } {
  const first = scrubDeterministic(summary);
  const second = applyPiiStrings(first.text, piiStrings);
  const text = second.text.replace(/\s+/g, " ").trim().slice(0, MAX_SUMMARY_LENGTH);
  return { text, removed: first.redactions.length + second.redactions.length };
}

export function deterministicSummary(f: ExtractedFields): string {
  const parts: string[] = [];
  const symptoms = f.symptoms.map((s) => symptomLabel(s).toLowerCase());
  if (symptoms.length > 0) {
    const onset = f.onsetDaysAgo !== null ? ` for ${f.onsetDaysAgo} day${f.onsetDaysAgo === 1 ? "" : "s"}` : "";
    parts.push(`${capitalize(symptoms.join(", "))}${onset}.`);
  } else {
    parts.push("No outbreak-related symptoms recorded.");
  }
  if (f.dangerSigns.length > 0) {
    parts.push(`Danger signs: ${f.dangerSigns.map((d) => dangerSignLabel(d).toLowerCase()).join(", ")}.`);
  }
  if (f.householdContact) parts.push("Household contact with similar illness.");
  if (f.householdDeath) parts.push("Recent death in the household reported.");
  return parts.join(" ").slice(0, MAX_SUMMARY_LENGTH);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function rulesOnlyDraft(prepared: PreparedNote, aiError: string | null, cloudPayload: string | null = null): Draft {
  return {
    fields: prepared.keywordFields,
    summary: deterministicSummary(prepared.keywordFields),
    route: "rules_only",
    latencyMs: null,
    redactionCount: prepared.redactionCount,
    cloudPayload,
    aiRisk: null,
    aiError,
  };
}

function aiDraft(prepared: PreparedNote, ai: AiExtraction & AiMeta, cloudPayload: string | null, extraRedactions: number): Draft {
  const fields = mergeFields(prepared.keywordFields, ai);
  const summary = sanitizeSummary(ai.summary, ai.piiStrings);
  return {
    fields,
    summary: summary.text || deterministicSummary(fields),
    route: ai.source,
    latencyMs: ai.latencyMs,
    redactionCount: prepared.redactionCount + extraRedactions + summary.removed,
    cloudPayload,
    aiRisk: { riskLevel: ai.riskOpinion, reason: ai.riskReason },
    aiError: null,
  };
}

/**
 * Runs the AI tier chosen by decideRoute. Falls back to the rules tier on any AI failure,
 * so the health worker is never blocked.
 */
export async function analyzeNote(
  raw: string,
  prepared: PreparedNote,
  decision: RouteDecision,
  deps: AiDeps,
): Promise<Draft> {
  if (decision.kind === "on_device") {
    const res = await deps.extractFromRawNote(raw.slice(0, MAX_NOTE_LENGTH));
    if (res.ok) {
      const extra = applyPiiStrings(prepared.scrubbedText, res.value.piiStrings);
      return aiDraft({ ...prepared, scrubbedText: extra.text }, res.value, null, extra.redactions.length);
    }
    return rulesOnlyDraft(prepared, res.error.message);
  }

  if (decision.kind === "cloud") {
    const res = await deps.extractFromScrubbedNote(prepared.scrubbedText);
    if (res.ok) {
      return aiDraft(prepared, res.value, res.value.source === "cloud" ? prepared.scrubbedText : null, 0);
    }
    // The request was sent even though it failed, so the privacy panel must still show what left the device.
    return rulesOnlyDraft(prepared, res.error.message, prepared.scrubbedText);
  }

  return rulesOnlyDraft(prepared, null);
}

export interface BuildCaseInput {
  caseId: string;
  workspaceId: string;
  agentUid: string;
  county: string;
  subCounty: SubCounty;
  fields: ExtractedFields;
  summary: string;
  route: InferenceRoute;
  latencyMs: number | null;
  redactionCount: number;
  aiRisk: AiRiskOpinion | null;
  now: number;
  isDemo?: boolean;
}

/** Applies the rules engine (risk floor) and returns the only shape that may be persisted. */
export function buildCaseRecord(input: BuildCaseInput): CaseRecord {
  const rules = evaluateRules(input.fields);
  const merged = mergeRisk(rules, input.aiRisk);
  const summary = sanitizeSummary(input.summary, []).text;
  return {
    caseId: input.caseId,
    workspaceId: input.workspaceId,
    agentUid: input.agentUid,
    county: input.county,
    subCounty: input.subCounty,
    ageBand: input.fields.ageBand,
    sex: input.fields.sex,
    onsetDaysAgo: input.fields.onsetDaysAgo,
    symptoms: [...input.fields.symptoms],
    dangerSigns: [...input.fields.dangerSigns],
    householdContact: input.fields.householdContact,
    householdDeath: input.fields.householdDeath,
    riskLevel: merged.riskLevel,
    rulesRiskLevel: rules.riskLevel,
    riskReasons: merged.reasons.map((r) => r.slice(0, 200)).slice(0, 12),
    deidentifiedSummary: summary,
    recommendedActions: actionsFor(merged.riskLevel),
    inferenceSource: input.route,
    latencyMs: input.latencyMs === null ? null : Math.round(input.latencyMs),
    redactionCount: input.redactionCount,
    clientCreatedAt: Math.round(input.now),
    isDemo: input.isDemo ?? false,
  };
}
