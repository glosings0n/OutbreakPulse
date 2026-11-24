/**
 * Builds the de-identified, aggregate-only input for the cloud SitRep.
 * This JSON is also stored with the report for auditability.
 */
import { aggregateCases, DAY_MS, startOfDay, type CasePoint, type SubCountyAggregate } from "./aggregate";
import { detectAll, overallStatus, type AlertStatus, type SubCountyStatus, type Thresholds } from "./detect";

export interface SurveillanceSnapshot {
  aggregates: SubCountyAggregate[];
  statuses: SubCountyStatus[];
  overall: AlertStatus;
  casesAnalyzed: number;
  windowStart: number;
}

export function buildSnapshot(
  cases: readonly CasePoint[],
  subCounties: readonly string[],
  opts: { now: number; windowDays: number; baselineDays: number; thresholds: Thresholds },
): SurveillanceSnapshot {
  const aggregates = aggregateCases(cases, subCounties, opts);
  const statuses = detectAll(aggregates, opts.thresholds);
  const windowStart = startOfDay(opts.now) - (opts.windowDays + opts.baselineDays - 1) * DAY_MS;
  return {
    aggregates,
    statuses,
    overall: overallStatus(statuses),
    casesAnalyzed: aggregates.reduce((n, a) => n + a.recentCount + a.baselineCount, 0),
    windowStart,
  };
}

/** Compact JSON sent to the cloud model. Contains counts and statuses only. */
export function snapshotToModelInput(s: SurveillanceSnapshot): string {
  const rows = s.aggregates.map((a) => {
    const st = s.statuses.find((x) => x.subCounty === a.subCounty);
    return {
      subCounty: a.subCounty,
      status: st?.status ?? "NORMAL",
      triggers: st?.triggers ?? [],
      recentCases: a.recentCount,
      baselineCases: a.baselineCount,
      recentDailyRate: a.recentDailyRate,
      baselineDailyRate: a.baselineDailyRate,
      rateRatio: a.rateRatio,
      highRiskRecent: a.highRiskRecent,
      householdLinkedRecent: a.householdLinkedRecent,
      householdDeathsRecent: a.deathsRecent,
      dailyCountsOldestFirst: a.daily,
    };
  });
  return JSON.stringify(rows);
}
