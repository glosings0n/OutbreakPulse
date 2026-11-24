/**
 * Deterministic aggregation of de-identified cases. Pure functions, no Firebase imports.
 * The cloud model only ever sees the output of this module, never individual cases.
 */
import { hasSevereDehydration } from "@/lib/triage/rules";
import type { AgeBand, DangerSignCode, RiskLevel, SymptomCode } from "@/lib/triage/vocabulary";

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface CasePoint {
  subCounty: string;
  clientCreatedAt: number;
  riskLevel: RiskLevel;
  householdContact: boolean;
  householdDeath: boolean;
  ageBand: AgeBand;
  symptoms: readonly SymptomCode[];
  dangerSigns: readonly DangerSignCode[];
  /** Absent on records written before the GTFCC classification was stored. */
  suspectedCholera?: boolean;
}

/**
 * Counts toward the GTFCC cholera alert: a person aged 2 or older (or of unrecorded age)
 * with acute watery diarrhoea and severe dehydration, or dying of it.
 */
export function isCholeraAlertCase(c: Pick<CasePoint, "ageBand" | "symptoms" | "dangerSigns" | "householdDeath">): boolean {
  return (
    c.ageBand !== "0-1" &&
    c.symptoms.includes("watery_diarrhoea") &&
    (hasSevereDehydration(c.dangerSigns) || c.householdDeath)
  );
}

/**
 * Suspected cholera status as stored at triage time. Records written before the status was stored
 * are classified with the standard GTFCC definition, which is the alert-case criterion above.
 */
export function isSuspectedCholera(
  c: Pick<CasePoint, "ageBand" | "symptoms" | "dangerSigns" | "householdDeath" | "suspectedCholera">,
): boolean {
  return c.suspectedCholera ?? isCholeraAlertCase(c);
}

export interface SubCountyAggregate {
  subCounty: string;
  /** Cases in the recent window. */
  recentCount: number;
  /** Cases in the baseline window that precedes the recent window. */
  baselineCount: number;
  recentDailyRate: number;
  baselineDailyRate: number;
  /** recentDailyRate / max(baselineDailyRate, floor). */
  rateRatio: number;
  highRiskRecent: number;
  householdLinkedRecent: number;
  deathsRecent: number;
  /** Suspected cholera cases (GTFCC definition in force at triage time) in the recent window. */
  suspectedRecent: number;
  /** Cases counting toward the GTFCC cholera alert in the recent window. */
  choleraAlertRecent: number;
  /** Daily counts, oldest first, covering baseline + recent windows. */
  daily: number[];
}

export interface AggregateOptions {
  now: number;
  windowDays: number;
  baselineDays: number;
}

/** Floor that avoids infinite ratios when the baseline is zero (one case per baseline window). */
function baselineFloor(baselineDays: number): number {
  return 1 / Math.max(baselineDays, 1);
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function aggregateCases(
  cases: readonly CasePoint[],
  subCounties: readonly string[],
  { now, windowDays, baselineDays }: AggregateOptions,
): SubCountyAggregate[] {
  const totalDays = windowDays + baselineDays;
  const today = startOfDay(now);
  const firstDay = today - (totalDays - 1) * DAY_MS;
  const recentStart = today - (windowDays - 1) * DAY_MS;

  const bySub = new Map<string, SubCountyAggregate>();
  for (const s of subCounties) {
    bySub.set(s, {
      subCounty: s,
      recentCount: 0,
      baselineCount: 0,
      recentDailyRate: 0,
      baselineDailyRate: 0,
      rateRatio: 0,
      highRiskRecent: 0,
      householdLinkedRecent: 0,
      deathsRecent: 0,
      suspectedRecent: 0,
      choleraAlertRecent: 0,
      daily: new Array<number>(totalDays).fill(0),
    });
  }

  for (const c of cases) {
    const agg = bySub.get(c.subCounty);
    if (!agg) continue;
    const day = startOfDay(c.clientCreatedAt);
    if (day < firstDay || day > today) continue;
    const index = Math.round((day - firstDay) / DAY_MS);
    agg.daily[index] += 1;
    if (day >= recentStart) {
      agg.recentCount += 1;
      if (c.riskLevel === "HIGH") agg.highRiskRecent += 1;
      if (c.householdContact) agg.householdLinkedRecent += 1;
      if (c.householdDeath) agg.deathsRecent += 1;
      if (isSuspectedCholera(c)) agg.suspectedRecent += 1;
      if (isCholeraAlertCase(c)) agg.choleraAlertRecent += 1;
    } else {
      agg.baselineCount += 1;
    }
  }

  for (const agg of bySub.values()) {
    agg.recentDailyRate = agg.recentCount / windowDays;
    agg.baselineDailyRate = baselineDays > 0 ? agg.baselineCount / baselineDays : 0;
    agg.rateRatio = round2(agg.recentDailyRate / Math.max(agg.baselineDailyRate, baselineFloor(baselineDays)));
    agg.recentDailyRate = round2(agg.recentDailyRate);
    agg.baselineDailyRate = round2(agg.baselineDailyRate);
  }

  return [...bySub.values()];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
