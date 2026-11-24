/**
 * Deterministic triage rules for the AWD / suspected cholera scenario.
 *
 * Illustrative protocol adapted from publicly available dehydration assessment guidance.
 * It is decision support for a demo, not clinical guidance.
 *
 * The output of this module is the risk FLOOR. AI may raise it with a stated reason, never lower it.
 */
import type { AgeBand, DangerSignCode, RiskLevel, SymptomCode } from "./vocabulary";

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
  meetsSuspectedCaseDefinition: boolean;
  recommendedActions: string[];
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

export function evaluateRules(f: ClinicalFields): RulesResult {
  const reasons: string[] = [];
  const has = (s: SymptomCode) => f.symptoms.includes(s);
  const sign = (d: DangerSignCode) => f.dangerSigns.includes(d);

  const awd = has("watery_diarrhoea");
  const lifeThreatening = LIFE_THREATENING.filter(sign);
  const dehydrationCount = DEHYDRATION_SIGNS.filter(sign).length;
  const severeDehydration = lifeThreatening.length > 0 || dehydrationCount >= 2;
  const anyDangerSign = f.dangerSigns.length > 0;

  let level: RiskLevel = "LOW";

  // HIGH
  if (awd && severeDehydration) {
    level = "HIGH";
    reasons.push("Acute watery diarrhoea with signs of severe dehydration");
  }
  if (awd && f.householdDeath) {
    level = "HIGH";
    reasons.push("Acute watery diarrhoea with a recent death in the household");
  }
  if (awd && f.ageBand === "0-4" && anyDangerSign) {
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
    if (awd && (f.ageBand === "0-4" || f.ageBand === "50+")) reasons.push("Watery diarrhoea in a high-risk age group");
    if (reasons.length > 0) level = "MEDIUM";
  }

  // LOW
  if (level === "LOW") {
    reasons.push(awd ? "Watery diarrhoea without danger signs" : "No outbreak-related danger criteria met");
  }

  // Suspected cholera case definition (illustrative):
  // any person aged 2+ with AWD and severe dehydration or death, or any AWD case linked to a household cluster.
  const meetsSuspectedCaseDefinition =
    awd && ((f.ageBand !== "0-4" && (severeDehydration || f.householdDeath)) || f.householdContact || f.householdDeath);
  if (meetsSuspectedCaseDefinition) reasons.push("Meets the suspected cholera case definition");

  return {
    riskLevel: level,
    reasons,
    severeDehydration,
    meetsSuspectedCaseDefinition,
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
