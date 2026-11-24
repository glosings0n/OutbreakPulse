/**
 * Deterministic triage rules for the AWD / suspected cholera scenario.
 *
 * Two separate outputs:
 * 1. Clinical risk level, from dehydration danger signs (adapted from public dehydration assessment guidance).
 * 2. Suspected cholera status, from the GTFCC surveillance case definitions, which depend on whether
 *    an outbreak has been declared in the area.
 * It is decision support for trained health workers, not clinical guidance.
 *
 * The risk level is the FLOOR. AI may raise it with a stated reason, never lower it.
 */
import { isUnderFive, type AgeBand, type CaseDefinition, type DangerSignCode, type RiskLevel, type SymptomCode } from "./vocabulary";

export interface ClinicalFields {
  ageBand: AgeBand;
  symptoms: readonly SymptomCode[];
  dangerSigns: readonly DangerSignCode[];
  householdContact: boolean;
  householdDeath: boolean;
  onsetDaysAgo: number | null;
}

export interface RulesResult {
  riskLevel: RiskLevel;
  reasons: string[];
  /** Severe dehydration: two or more classic signs, or any life-threatening sign. */
  severeDehydration: boolean;
  /** Which GTFCC definition was applied, from the outbreak declaration status of the area. */
  caseDefinition: CaseDefinition;
  meetsSuspectedCaseDefinition: boolean;
  /** Plain-language explanation of the case definition result. */
  caseDefinitionReason: string;
  recommendedActions: string[];
}

export interface RulesContext {
  /** True when the county team has declared an outbreak in the case's sub-county. */
  outbreakDeclared: boolean;
}

const LIFE_THREATENING: readonly DangerSignCode[] = [
  "lethargic_or_unconscious",
  "unable_to_drink",
  "rapid_weak_pulse",
  "convulsions",
];

const DEHYDRATION_SIGNS: readonly DangerSignCode[] = [
  "lethargic_or_unconscious",
  "unable_to_drink",
  "sunken_eyes",
  "slow_skin_pinch",
];

const ACTIONS: Record<RiskLevel, string[]> = {
  HIGH: [
    "Start oral rehydration solution immediately and keep giving it on the way",
    "Refer urgently to the nearest health facility",
    "Notify the sub-county surveillance focal person today",
    "Advise the household on safe water treatment and handwashing",
  ],
  MEDIUM: [
    "Give oral rehydration solution and teach the caregiver how to prepare it",
    "Follow up within 24 hours and refer if any danger sign appears",
    "Advise the household on safe water treatment and handwashing",
  ],
  LOW: [
    "Give oral rehydration solution sachets and home care advice",
    "Ask the household to return or call if danger signs appear",
  ],
};

export const RISK_ORDER: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

/** Severe dehydration: any life-threatening sign, or two or more classic dehydration signs. */
export function hasSevereDehydration(dangerSigns: readonly DangerSignCode[]): boolean {
  const sign = (d: DangerSignCode) => dangerSigns.includes(d);
  return LIFE_THREATENING.some(sign) || DEHYDRATION_SIGNS.filter(sign).length >= 2;
}

interface CaseDefinitionResult {
  meets: boolean;
  reason: string;
}

/**
 * GTFCC suspected cholera case definitions (Public health surveillance for cholera, guidance document).
 * - No outbreak declared: a person aged 2 years or older with AWD and severe dehydration, or dying of AWD.
 * - Outbreak declared: any person presenting with or dying of AWD.
 * AWD is three or more loose or watery stools in 24 hours. A death is taken from the household death field,
 * which covers the patient and household members.
 */
export function suspectedCholera(
  f: Pick<ClinicalFields, "ageBand" | "symptoms" | "dangerSigns" | "householdDeath">,
  ctx: RulesContext,
): CaseDefinitionResult {
  const awd = f.symptoms.includes("watery_diarrhoea");
  if (!awd) return { meets: false, reason: "No acute watery diarrhoea, so the suspected cholera definition does not apply" };
  if (ctx.outbreakDeclared) {
    return { meets: true, reason: "Outbreak declared in this area: every case of acute watery diarrhoea is a suspected cholera case" };
  }
  if (f.ageBand === "0-1") {
    return { meets: false, reason: "Under 2 years: outside the standard suspected cholera definition while no outbreak is declared" };
  }
  const severe = hasSevereDehydration(f.dangerSigns);
  if (severe || f.householdDeath) {
    const age = f.ageBand === "unknown" ? "age not recorded, assumed 2 or older" : "aged 2 or older";
    return {
      meets: true,
      reason: `Suspected cholera: ${age}, acute watery diarrhoea with ${severe ? "severe dehydration" : "a death from diarrhoea"}`,
    };
  }
  return { meets: false, reason: "Acute watery diarrhoea without severe dehydration or death: not a suspected cholera case while no outbreak is declared" };
}

export function evaluateRules(f: ClinicalFields, ctx: RulesContext = { outbreakDeclared: false }): RulesResult {
  const reasons: string[] = [];
  const has = (s: SymptomCode) => f.symptoms.includes(s);
  const sign = (d: DangerSignCode) => f.dangerSigns.includes(d);

  const awd = has("watery_diarrhoea");
  const severeDehydration = hasSevereDehydration(f.dangerSigns);
  const anyDangerSign = f.dangerSigns.length > 0;
  const underFive = isUnderFive(f.ageBand);

  let level: RiskLevel = "LOW";

  // HIGH
  if (awd && severeDehydration) {
    level = "HIGH";
    reasons.push("Acute watery diarrhoea with signs of severe dehydration");
  }
  if (awd && f.householdDeath) {
    level = "HIGH";
    reasons.push("Acute watery diarrhoea with a death from diarrhoea in the household");
  }
  if (awd && underFive && anyDangerSign) {
    level = "HIGH";
    reasons.push("Child under five with diarrhoea and a danger sign");
  }
  if (sign("convulsions")) {
    level = "HIGH";
    reasons.push("Convulsions reported");
  }

  // MEDIUM
  if (level === "LOW") {
    if (awd && has("vomiting")) reasons.push("Watery diarrhoea with vomiting");
    if (awd && anyDangerSign) reasons.push("Watery diarrhoea with a dehydration sign");
    if (awd && f.householdContact) reasons.push("Watery diarrhoea with a sick household contact");
    if (has("bloody_diarrhoea")) reasons.push("Bloody diarrhoea");
    if (awd && (underFive || f.ageBand === "50+")) reasons.push("Watery diarrhoea in a high-risk age group");
    if (reasons.length > 0) level = "MEDIUM";
  }

  // LOW
  if (level === "LOW") {
    reasons.push(awd ? "Watery diarrhoea without danger signs" : "No outbreak-related danger criteria met");
  }

  const definition = suspectedCholera(f, ctx);
  if (definition.meets) reasons.push("Meets the suspected cholera case definition");

  return {
    riskLevel: level,
    reasons,
    severeDehydration,
    caseDefinition: ctx.outbreakDeclared ? "outbreak" : "standard",
    meetsSuspectedCaseDefinition: definition.meets,
    caseDefinitionReason: definition.reason,
    recommendedActions: ACTIONS[level],
  };
}

export interface AiRiskOpinion {
  riskLevel: RiskLevel;
  reason: string;
}

export interface MergedRisk {
  riskLevel: RiskLevel;
  reasons: string[];
  raisedByAi: boolean;
}

/** Rules are the floor. AI may only raise the level, and only with a non-empty reason. */
export function mergeRisk(rules: RulesResult, ai: AiRiskOpinion | null): MergedRisk {
  if (!ai || RISK_ORDER[ai.riskLevel] <= RISK_ORDER[rules.riskLevel] || ai.reason.trim().length === 0) {
    return { riskLevel: rules.riskLevel, reasons: rules.reasons, raisedByAi: false };
  }
  return {
    riskLevel: ai.riskLevel,
    reasons: [...rules.reasons, `Raised by AI review: ${ai.reason.trim()}`],
    raisedByAi: true,
  };
}

export function actionsFor(level: RiskLevel): string[] {
  return ACTIONS[level];
}
