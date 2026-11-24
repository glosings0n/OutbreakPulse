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
