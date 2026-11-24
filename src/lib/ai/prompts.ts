/**
 * Prompts are single-turn (on-device inference does not support chat) and self-contained.
 * Clinical decisions stay with the deterministic rules engine; the model extracts and explains.
 */
import { DANGER_SIGNS, SYMPTOMS } from "@/lib/triage/vocabulary";

const vocabulary = [
  "Symptom codes:",
  ...SYMPTOMS.map((s) => `- ${s.code}: ${s.label}`),
  "Danger sign codes:",
  ...DANGER_SIGNS.map((d) => `- ${d.code}: ${d.label}`),
].join("\n");

const extractionRules = `
You convert a community health worker's field note about one patient into a structured case record
for acute watery diarrhoea and suspected cholera surveillance.

Rules:
- Only use the codes listed below. Do not invent symptoms that the note does not mention.
- ageBand: "0-1" (under 2 years), "2-4", "5-14", "15-49", "50+" or "unknown".
- onsetDaysAgo: whole days since symptoms started, -1 if not stated.
- householdContact: true if anyone else in the household or a close contact is sick with similar symptoms.
- householdDeath: true if a death in the household or among close contacts is mentioned.
- summary: one or two short clinical sentences. Never include names, phone numbers, addresses, ages in years or places.
- riskOpinion and riskReason: your own risk assessment (LOW, MEDIUM or HIGH) with one short reason.
  A separate rules engine decides the final level; your opinion can only raise it.

${vocabulary}
`.trim();

export function rawNotePrompt(note: string): string {
  return `${extractionRules}
- piiStrings: list every exact substring of the note that could identify a person
  (personal names, nicknames, phone numbers, ID numbers, house or plot descriptions). Copy them exactly.

Field note:
"""
${note}
"""`;
}

export const PHOTO_TRANSCRIPTION_PROMPT = `The image is a photo of a community health worker's paper note about one patient.
Transcribe the note word for word, keeping numbers, abbreviations and line order. Do not summarise or correct it.
If the image does not show a readable note, set legible to false and leave transcript empty.`;

export function scrubbedNotePrompt(scrubbedNote: string): string {
  return `${extractionRules}
- The note was already de-identified. Placeholders such as [NAME] or [PHONE] replace personal data.
- piiStrings: return an empty list unless you still see personal data.

De-identified field note:
"""
${scrubbedNote}
"""`;
}

export function sitrepPrompt(input: {
  county: string;
  windowDays: number;
  baselineDays: number;
  overallStatus: string;
  aggregateJson: string;
}): string {
  return `You are an epidemiologist drafting a weekly situation report (SitRep) for the ${input.county}
health management team about acute watery diarrhoea and suspected cholera.

You receive ONLY aggregated, de-identified counts computed by a deterministic surveillance engine.
The alert statuses are already decided; do not change them. Do not invent numbers that are not in the data.
Do not claim confirmed transmission chains: phrase links as hypotheses that field teams should verify.
householdDeathsRecent counts deaths reported by health workers in case households; call them household deaths.
suspectedCholeraRecent counts cases meeting the GTFCC suspected cholera definition in force at triage time.
choleraAlertCasesRecent counts people aged 2 or older with acute watery diarrhoea and severe dehydration or death;
two or more in one sub-county is a GTFCC cholera alert, which calls for investigation and testing, not a confirmed outbreak.
outbreakDeclared tells whether the county team has declared an outbreak in that sub-county.
Write alert statuses as ordinary lowercase words ("critical", "watch", "normal"), never in capital letters.

Recent window: last ${input.windowDays} days. Baseline: the ${input.baselineDays} days before that.
Overall county status: ${input.overallStatus.toLowerCase()}.

Aggregated data per sub-county (JSON):
${input.aggregateJson}

Write:
- executiveSummary: three to five sentences, plain English, most urgent sub-county first.
- hypotheses: two to four field hypotheses to investigate (for example a shared water source or a gathering).
- recommendations: three to six concrete actions with the sub-county they apply to
  (for example oral rehydration stock, water treatment, active case finding, community messaging).`;
}
