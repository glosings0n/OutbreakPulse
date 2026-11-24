/**
 * One schema per task, shared by the on-device model (responseConstraint)
 * and the cloud model (responseSchema). Zod validates every response before use.
 */
import { Schema } from "firebase/ai";
import { z } from "zod";
import { AGE_BANDS, DANGER_SIGN_CODES, RISK_LEVELS, SEXES, SYMPTOM_CODES } from "@/lib/triage/vocabulary";

export const extractionSchema = Schema.object({
  properties: {
    ageBand: Schema.enumString({ enum: [...AGE_BANDS] }),
    sex: Schema.enumString({ enum: [...SEXES] }),
    onsetDaysAgo: Schema.integer({ description: "Days since symptom onset, -1 if unknown" }),
    symptoms: Schema.array({ items: Schema.enumString({ enum: [...SYMPTOM_CODES] }) }),
    dangerSigns: Schema.array({ items: Schema.enumString({ enum: [...DANGER_SIGN_CODES] }) }),
    householdContact: Schema.boolean(),
    householdDeath: Schema.boolean(),
    piiStrings: Schema.array({
      items: Schema.string(),
      description: "Exact substrings of the note that identify a person: names, nicknames, phone numbers, house descriptions",
    }),
    summary: Schema.string({ description: "One or two clinical sentences with no names, numbers or places" }),
    riskOpinion: Schema.enumString({ enum: [...RISK_LEVELS] }),
    riskReason: Schema.string(),
  },
});

export const extractionZod = z.object({
  ageBand: z.enum(AGE_BANDS).catch("unknown"),
  sex: z.enum(SEXES).catch("unknown"),
  onsetDaysAgo: z.number().int().catch(-1),
  symptoms: z.array(z.enum(SYMPTOM_CODES)).catch([]),
  dangerSigns: z.array(z.enum(DANGER_SIGN_CODES)).catch([]),
  householdContact: z.boolean().catch(false),
  householdDeath: z.boolean().catch(false),
  piiStrings: z.array(z.string()).catch([]),
  summary: z.string().catch(""),
  riskOpinion: z.enum(RISK_LEVELS).catch("LOW"),
  riskReason: z.string().catch(""),
});

export type AiExtraction = z.infer<typeof extractionZod>;

/** Transcription of a photographed paper note. Produced on the device only. */
export const transcriptionSchema = Schema.object({
  properties: {
    transcript: Schema.string({ description: "The handwritten or printed note, word for word" }),
    legible: Schema.boolean({ description: "False when the photo does not show a readable note" }),
  },
});

export const transcriptionZod = z.object({
  transcript: z.string().catch(""),
  legible: z.boolean().catch(false),
});

export type AiTranscription = z.infer<typeof transcriptionZod>;

export const sitrepSchema = Schema.object({
  properties: {
    executiveSummary: Schema.string({ description: "Three to five sentences for the county health management team" }),
    hypotheses: Schema.array({
      items: Schema.string(),
      description: "Hypotheses to investigate in the field, phrased as questions or possibilities, never as facts",
    }),
    recommendations: Schema.array({
      items: Schema.string(),
      description: "Concrete resource and response actions, each tied to a sub-county",
    }),
  },
});

export const sitrepZod = z.object({
  executiveSummary: z.string().min(1).max(4000),
  hypotheses: z.array(z.string().max(400)).max(10),
  recommendations: z.array(z.string().max(400)).max(10),
});

export type AiSitrep = z.infer<typeof sitrepZod>;

/** Parses model JSON safely. Models occasionally wrap JSON in code fences. */
export function parseJson<T>(text: string, schema: z.ZodType<T>): T | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    const parsed = schema.safeParse(JSON.parse(cleaned));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
