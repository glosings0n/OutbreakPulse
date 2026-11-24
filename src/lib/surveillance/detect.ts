/**
 * Deterministic alert detection. Thresholds come from Remote Config so the county team
 * can tune sensitivity without shipping a new build.
 */
import type { SubCountyAggregate } from "./aggregate";

export const ALERT_STATUSES = ["NORMAL", "WATCH", "CRITICAL"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const ALERT_LABELS: Record<AlertStatus, string> = {
  NORMAL: "Normal",
  WATCH: "Watch",
  CRITICAL: "Critical",
};

const ALERT_ORDER: Record<AlertStatus, number> = { NORMAL: 0, WATCH: 1, CRITICAL: 2 };

export interface Thresholds {
  watch: number;
  critical: number;
}

export interface SubCountyStatus {
  subCounty: string;
  status: AlertStatus;
  triggers: string[];
}

/** GTFCC alert threshold, fixed by the guidance rather than tuned in Remote Config. */
export const CHOLERA_ALERT_MIN_CASES = 2;

export function detectSubCounty(agg: SubCountyAggregate, t: Thresholds): SubCountyStatus {
  const triggers: string[] = [];
  let status: AlertStatus = "NORMAL";

  if (agg.recentCount >= t.critical) {
    status = "CRITICAL";
    triggers.push(`${agg.recentCount} cases in window (critical threshold ${t.critical})`);
  }
  if (agg.deathsRecent > 0 && agg.recentCount >= t.watch) {
    status = "CRITICAL";
    triggers.push(`${agg.deathsRecent} ${agg.deathsRecent === 1 ? "household death" : "household deaths"} among ${agg.recentCount} cases`);
  }
  if (status !== "CRITICAL") {
    if (agg.recentCount >= t.watch) {
      status = "WATCH";
      triggers.push(`${agg.recentCount} cases in window (watch threshold ${t.watch})`);
    }
    if (agg.recentCount >= 2 && agg.rateRatio >= 3) {
      status = "WATCH";
      triggers.push(`Daily rate ${agg.rateRatio}x above baseline`);
    }
    if (agg.highRiskRecent >= 2) {
      status = "WATCH";
      triggers.push(`${agg.highRiskRecent} high-risk cases in window`);
    }
  }
  // GTFCC cholera alert: two or more people aged 2 or older with AWD and severe dehydration,
  // or dying of AWD, in the same area within the window. It always deserves at least a watch.
  if (agg.choleraAlertRecent >= CHOLERA_ALERT_MIN_CASES) {
    if (status === "NORMAL") status = "WATCH";
    triggers.push(`Cholera alert: ${agg.choleraAlertRecent} cases aged 2 or older with severe dehydration or death`);
  }

  return { subCounty: agg.subCounty, status, triggers };
}

export function detectAll(aggs: readonly SubCountyAggregate[], t: Thresholds): SubCountyStatus[] {
  return aggs.map((a) => detectSubCounty(a, t));
}

export function overallStatus(statuses: readonly SubCountyStatus[]): AlertStatus {
  return statuses.reduce<AlertStatus>(
    (acc, s) => (ALERT_ORDER[s.status] > ALERT_ORDER[acc] ? s.status : acc),
    "NORMAL",
  );
}

/** Ensures thresholds are sane even if Remote Config is misconfigured. */
export function normalizeThresholds(watch: number, critical: number): Thresholds {
  const w = Number.isFinite(watch) && watch >= 1 ? Math.floor(watch) : 3;
  const c = Number.isFinite(critical) && critical > w ? Math.floor(critical) : w * 2;
  return { watch: w, critical: c };
}
