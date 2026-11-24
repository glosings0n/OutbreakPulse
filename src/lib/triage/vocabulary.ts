/**
 * Controlled vocabulary for the acute watery diarrhoea (AWD) / suspected cholera scenario.
 * Codes are stored in Firestore; labels are shown in the UI.
 * Keyword lists feed the deterministic extractor used when no AI is available.
 */

export const SYMPTOMS = [
  { code: "watery_diarrhoea", label: "Acute watery diarrhoea", keywords: ["watery diarrh", "watery stool", "rice water", "rice-water", "awd", "loose stool", "running stomach"] },
  { code: "bloody_diarrhoea", label: "Bloody diarrhoea", keywords: ["bloody diarrh", "blood in stool", "bloody stool"] },
  { code: "vomiting", label: "Vomiting", keywords: ["vomit", "throwing up"] },
  { code: "fever", label: "Fever", keywords: ["fever", "febrile", "hot body"] },
  { code: "abdominal_cramps", label: "Abdominal cramps", keywords: ["abdominal pain", "stomach pain", "abdominal cramp", "stomach cramp"] },
  { code: "leg_cramps", label: "Leg cramps", keywords: ["leg cramp", "muscle cramp"] },
  { code: "intense_thirst", label: "Intense thirst", keywords: ["thirst", "drinks eagerly"] },
  { code: "reduced_urine", label: "Reduced urine output", keywords: ["no urine", "little urine", "reduced urine", "not passing urine"] },
] as const;

export const DANGER_SIGNS = [
  { code: "lethargic_or_unconscious", label: "Lethargic or unconscious", keywords: ["lethargic", "unconscious", "very weak", "not responding", "drowsy"] },
  { code: "unable_to_drink", label: "Unable to drink", keywords: ["unable to drink", "cannot drink", "can't drink", "not able to drink", "drinks poorly"] },
  { code: "sunken_eyes", label: "Sunken eyes", keywords: ["sunken eye"] },
  { code: "slow_skin_pinch", label: "Skin pinch goes back slowly", keywords: ["skin pinch", "skin turgor", "slow pinch"] },
  { code: "rapid_weak_pulse", label: "Rapid or weak pulse", keywords: ["weak pulse", "rapid pulse", "no pulse", "fast pulse"] },
  { code: "convulsions", label: "Convulsions", keywords: ["convuls", "seizure", "fits"] },
] as const;

export type SymptomCode = (typeof SYMPTOMS)[number]["code"];
export type DangerSignCode = (typeof DANGER_SIGNS)[number]["code"];

export const SYMPTOM_CODES = SYMPTOMS.map((s) => s.code) as [SymptomCode, ...SymptomCode[]];
export const DANGER_SIGN_CODES = DANGER_SIGNS.map((s) => s.code) as [DangerSignCode, ...DangerSignCode[]];

/**
 * Under-five is split at two years because the GTFCC suspected cholera definition
 * (outside a declared outbreak) only applies from age 2.
 */
export const AGE_BANDS = ["0-1", "2-4", "5-14", "15-49", "50+", "unknown"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** Band stored by earlier versions. Read as "unknown" because it does not say whether the child is under 2. */
export const LEGACY_AGE_BANDS = ["0-4"] as const;

export function isUnderFive(band: AgeBand): boolean {
  return band === "0-1" || band === "2-4";
}

export const SEXES = ["female", "male", "unknown"] as const;
export type Sex = (typeof SEXES)[number];

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: "Low risk",
  MEDIUM: "Medium risk",
  HIGH: "High risk",
};

/**
 * Which suspected cholera case definition applies (GTFCC):
 * - standard: no outbreak declared in the area; age 2+ with AWD and severe dehydration, or dying of AWD.
 * - outbreak: an outbreak has been declared in the area; any person with or dying of AWD.
 */
export const CASE_DEFINITIONS = ["standard", "outbreak"] as const;
export type CaseDefinition = (typeof CASE_DEFINITIONS)[number];

export const CASE_DEFINITION_LABELS: Record<CaseDefinition, string> = {
  standard: "Standard definition (no outbreak declared)",
  outbreak: "Outbreak definition (outbreak declared)",
};

/** Fictional demo geography. */
export const COUNTY = "Lakeshore County";
export const SUB_COUNTIES = ["Riverside", "Market Hill", "North Bay", "Kilima", "Old Town"] as const;
export type SubCounty = (typeof SUB_COUNTIES)[number];

export function symptomLabel(code: SymptomCode): string {
  return SYMPTOMS.find((s) => s.code === code)?.label ?? code;
}

export function dangerSignLabel(code: DangerSignCode): string {
  return DANGER_SIGNS.find((s) => s.code === code)?.label ?? code;
}

export function ageBandFromYears(years: number): AgeBand {
  if (!Number.isFinite(years) || years < 0) return "unknown";
  if (years < 2) return "0-1";
  if (years < 5) return "2-4";
  if (years < 15) return "5-14";
  if (years < 50) return "15-49";
  return "50+";
}
