import { z } from "zod";
import {
  AGE_BANDS,
  CASE_DEFINITIONS,
  DANGER_SIGN_CODES,
  LEGACY_AGE_BANDS,
  RISK_LEVELS,
  SEXES,
  SYMPTOM_CODES,
} from "@/lib/triage/vocabulary";

export const INFERENCE_ROUTES = ["on_device", "cloud", "rules_only"] as const;
export type InferenceRoute = (typeof INFERENCE_ROUTES)[number];

export const INFERENCE_ROUTE_LABELS: Record<InferenceRoute, string> = {
  on_device: "On-device",
  cloud: "Cloud",
  rules_only: "Rules engine",
};

/** The only shape that may ever be persisted. Mirrors the allowlist in firestore.rules. */
export const caseRecordSchema = z.object({
  caseId: z.string().regex(/^OP-[0-9A-Z]{8}$/),
  workspaceId: z.string().min(1),
  agentUid: z.string().min(1),
  county: z.string().max(64),
  subCounty: z.string().max(64),
  // Records written before the under-2 split used "0-4"; they are read as "unknown".
  ageBand: z.preprocess(
    (v) => ((LEGACY_AGE_BANDS as readonly unknown[]).includes(v) ? "unknown" : v),
    z.enum(AGE_BANDS),
  ),
  sex: z.enum(SEXES),
  onsetDaysAgo: z.number().int().min(0).max(60).nullable(),
  symptoms: z.array(z.enum(SYMPTOM_CODES)).max(16),
  dangerSigns: z.array(z.enum(DANGER_SIGN_CODES)).max(16),
  householdContact: z.boolean(),
  householdDeath: z.boolean(),
  riskLevel: z.enum(RISK_LEVELS),
  rulesRiskLevel: z.enum(RISK_LEVELS),
  /** GTFCC suspected cholera status at triage time. Absent on records written before it existed. */
  suspectedCholera: z.boolean().optional(),
  caseDefinition: z.enum(CASE_DEFINITIONS).optional(),
  riskReasons: z.array(z.string().max(200)).max(12),
  deidentifiedSummary: z.string().max(400),
  recommendedActions: z.array(z.string().max(200)).max(8),
  inferenceSource: z.enum(INFERENCE_ROUTES),
  latencyMs: z.number().int().nonnegative().nullable(),
  redactionCount: z.number().int().nonnegative(),
  clientCreatedAt: z.number().int(),
  isDemo: z.boolean(),
});

export type CaseRecord = z.infer<typeof caseRecordSchema>;

/** A case as displayed, with its sync state from Firestore metadata. */
export interface CaseView extends CaseRecord {
  pendingSync: boolean;
}
