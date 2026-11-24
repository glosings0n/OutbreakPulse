import { describe, expect, it } from "vitest";
import { buildDemoCases } from "@/lib/demo/seed";
import { caseRecordSchema } from "@/lib/cases/types";
import { SUB_COUNTIES } from "@/lib/triage/vocabulary";
import { aggregateCases, DAY_MS, type CasePoint } from "./aggregate";
import { detectSubCounty, normalizeThresholds, overallStatus } from "./detect";
import { buildSnapshot, snapshotToModelInput } from "./report";

const NOW = new Date("2026-11-23T15:00:00").getTime();
const point = (subCounty: string, daysAgo: number, riskLevel: CasePoint["riskLevel"] = "LOW"): CasePoint => ({
  subCounty,
  clientCreatedAt: NOW - daysAgo * DAY_MS,
  riskLevel,
  householdContact: false,
  householdDeath: false,
});

describe("aggregateCases", () => {
  it("splits recent and baseline windows and builds a daily series", () => {
    const cases = [point("A", 0), point("A", 1), point("A", 10), point("B", 3), point("A", 40)];
    const [a, b] = aggregateCases(cases, ["A", "B"], { now: NOW, windowDays: 7, baselineDays: 14 });
    expect(a.recentCount).toBe(2);
    expect(a.baselineCount).toBe(1);
    expect(a.daily).toHaveLength(21);
    expect(a.daily.reduce((x, y) => x + y, 0)).toBe(3);
    expect(b.recentCount).toBe(1);
  });

  it("ignores unknown sub-counties and future cases", () => {
    const [a] = aggregateCases([point("Z", 0), point("A", -2)], ["A"], { now: NOW, windowDays: 7, baselineDays: 14 });
    expect(a.recentCount).toBe(0);
  });
});

describe("detect", () => {
  const t = { watch: 3, critical: 6 };
  const agg = (recent: number, extra: Partial<ReturnType<typeof aggregateCases>[number]> = {}) => ({
    subCounty: "A",
    recentCount: recent,
    baselineCount: 0,
    recentDailyRate: 0,
    baselineDailyRate: 0,
    rateRatio: 0,
    highRiskRecent: 0,
    householdLinkedRecent: 0,
    deathsRecent: 0,
    daily: [],
    ...extra,
  });

  it("applies thresholds", () => {
    expect(detectSubCounty(agg(1), t).status).toBe("NORMAL");
    expect(detectSubCounty(agg(3), t).status).toBe("WATCH");
    expect(detectSubCounty(agg(6), t).status).toBe("CRITICAL");
  });

  it("escalates on deaths and high-risk clusters", () => {
    expect(detectSubCounty(agg(3, { deathsRecent: 1 }), t).status).toBe("CRITICAL");
    expect(detectSubCounty(agg(2, { highRiskRecent: 2 }), t).status).toBe("WATCH");
  });

  it("normalizes broken thresholds", () => {
    expect(normalizeThresholds(Number.NaN, 2)).toEqual({ watch: 3, critical: 6 });
    expect(normalizeThresholds(4, 4)).toEqual({ watch: 4, critical: 8 });
  });
});

describe("demo dataset", () => {
  const cases = buildDemoCases("w1", "u1", NOW);

  it("contains only valid, de-identified records", () => {
    for (const c of cases) expect(caseRecordSchema.safeParse(c).success).toBe(true);
    expect(new Set(cases.map((c) => c.caseId)).size).toBe(cases.length);
  });

  it("gives each workspace its own document IDs and the same scenario", () => {
    const other = buildDemoCases("w2", "u2", NOW);
    const ids = new Set(cases.map((c) => c.caseId));
    expect(other.some((c) => ids.has(c.caseId))).toBe(false);
    expect(other.map((c) => c.subCounty)).toEqual(cases.map((c) => c.subCounty));
  });

  it("tells the intended story with default thresholds", () => {
    const snap = buildSnapshot(cases, SUB_COUNTIES, { now: NOW, windowDays: 7, baselineDays: 14, thresholds: { watch: 3, critical: 6 } });
    const status = Object.fromEntries(snap.statuses.map((s) => [s.subCounty, s.status]));
    expect(status["Riverside"]).toBe("CRITICAL");
    expect(overallStatus(snap.statuses)).toBe("CRITICAL");
    const input = snapshotToModelInput(snap);
    expect(input).not.toMatch(/OP-[0-9A-Z]{8}/);
    expect(input).not.toContain("deidentifiedSummary");
  });
});
