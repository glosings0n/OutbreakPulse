/**
 * Deterministic keyword extractor. This is the no-AI tier: it pre-fills the case form
 * from a scrubbed note when neither Gemini Nano nor the network is available.
 * The health worker always reviews and corrects the result before saving.
 */
import {
  DANGER_SIGNS,
  SYMPTOMS,
  SUB_COUNTIES,
  ageBandFromYears,
  type AgeBand,
  type DangerSignCode,
  type Sex,
  type SubCounty,
  type SymptomCode,
} from "./vocabulary";

export interface ExtractedFields {
  ageBand: AgeBand;
  sex: Sex;
  onsetDaysAgo: number | null;
  symptoms: SymptomCode[];
  dangerSigns: DangerSignCode[];
  householdContact: boolean;
  householdDeath: boolean;
  subCounty: SubCounty | null;
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

export function extractByKeywords(note: string): ExtractedFields {
  const text = note.toLowerCase();

  const symptoms = SYMPTOMS.filter((s) => includesAny(text, s.keywords)).map((s) => s.code);
  const dangerSigns = DANGER_SIGNS.filter((d) => includesAny(text, d.keywords)).map((d) => d.code);

  // Plain "diarrhoea" with "watery" nearby counts as AWD.
  if (!symptoms.includes("watery_diarrhoea") && /diarrh/.test(text) && /water/.test(text)) {
    symptoms.push("watery_diarrhoea");
  }

  let ageBand: AgeBand = "unknown";
  const months = text.match(/(\d{1,2})\s*(?:months?|mo)\b/);
  const years = text.match(/(\d{1,3})\s*(?:years?|yrs?|y\/o|yo)\b/);
  if (months) ageBand = ageBandFromYears(Number(months[1]) / 12);
  else if (years) ageBand = ageBandFromYears(Number(years[1]));
  else if (/\b(infant|baby|newborn)\b/.test(text)) ageBand = "0-1";
  else if (/\b(elderly|old man|old woman|grandmother|grandfather)\b/.test(text)) ageBand = "50+";

  let sex: Sex = "unknown";
  if (/\b(female|woman|girl|she|her|mother|pregnant)\b/.test(text)) sex = "female";
  else if (/\b(male|man|boy|he|him|father)\b/.test(text)) sex = "male";

  let onsetDaysAgo: number | null = null;
  const onset = text.match(/(\d{1,2})\s*days?\b/);
  if (onset) onsetDaysAgo = Number(onset[1]);
  else if (/\b(since yesterday|yesterday)\b/.test(text)) onsetDaysAgo = 1;
  else if (/\b(today|this morning|since morning)\b/.test(text)) onsetDaysAgo = 0;

  const householdContact =
    /\b(also|too)\s+(sick|ill|has|have)\b|\b(sick|ill)\s+too\b|household contact|others in the (house|household)|family members? (are |is )?(sick|ill)|(brother|sister|mother|father|child|children|neighbou?r|wife|husband)s?\s+(is |are |also |too )*(sick|ill)/.test(
      text,
    );
  const householdDeath = /\b(died|death|passed away|dead)\b/.test(text);

  const subCounty = SUB_COUNTIES.find((s) => text.includes(s.toLowerCase())) ?? null;

  return { ageBand, sex, onsetDaysAgo, symptoms, dangerSigns, householdContact, householdDeath, subCounty };
}
