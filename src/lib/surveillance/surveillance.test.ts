import { describe, expect, it } from "vitest";
import { buildDemoCases } from "@/lib/demo/seed";
import { caseRecordSchema } from "@/lib/cases/types";
import { SUB_COUNTIES } from "@/lib/triage/vocabulary";
import { aggregateCases, DAY_MS, isCholeraAlertCase, isSuspectedCholera, type CasePoint } from "./aggregate";
import { detectSubCounty, normalizeThresholds, overallStatus } from "./detect";
import { epiCurve } from "./epicurve";
import { buildSnapshot, snapshotToModelInput } from "./report";

const NOW = new Date("2026-11-23T15:00:00").getTime();
const point = (subCounty: string, daysAgo: number, riskLevel: CasePoint["riskLevel"] = "LOW"): CasePoint => ({
  subCounty,
  clientCreatedAt: NOW - daysAgo * DAY_MS,
  riskLevel,
  householdContact: false,
  householdDeath: false,
  ageBand: "15-49",
  symptoms: ["watery_diarrhoea"],
  dangerSigns: [],
});
const severePoint = (subCounty: string, daysAgo: number, ageBand: CasePoint["ageBand"] = "15-49"): CasePoint => ({
  ...point(subCounty, daysAgo, "HIGH"),
  ageBand,
  dangerSigns: ["sunken_eyes", "slow_skin_pinch"],
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

  it("counts GTFCC alert cases, excluding children under 2", () => {
    const cases = [severePoint("A", 1), severePoint("A", 2, "0-1"), severePoint("A", 3, "unknown"), severePoint("A", 12)];
    const [a] = aggregateCases(cases, ["A"], { now: NOW, windowDays: 7, baselineDays: 14 });
    expect(a.choleraAlertRecent).toBe(2);
    expect(isCholeraAlertCase({ ...point("A", 0), householdDeath: true })).toBe(true);
    expect(isCholeraAlertCase(point("A", 0))).toBe(false);
  });

  it("counts stored suspected cholera classifications", () => {
    const cases = [{ ...point("A", 0), suspectedCholera: true }, point("A", 1), { ...point("A", 2), suspectedCholera: false }];
    const [a] = aggregateCases(cases, ["A"], { now: NOW, windowDays: 7, baselineDays: 14 });
    expect(a.suspectedRecent).toBe(1);
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
    suspectedRecent: 0,
    choleraAlertRecent: 0,
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

  it("raises a GTFCC cholera alert from two severe cases, below the count thresholds", () => {
    const s = detectSubCounty(agg(2, { choleraAlertRecent: 2 }), t);
    expect(s.status).toBe("WATCH");
    expect(s.triggers.join(" ")).toContain("Cholera alert");
    expect(detectSubCounty(agg(1, { choleraAlertRecent: 1 }), t).status).toBe("NORMAL");
    expect(detectSubCounty(agg(7, { choleraAlertRecent: 2 }), t).status).toBe("CRITICAL");
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

  it("reads legacy records written before the under-2 split", () => {
    const legacy: Record<string, unknown> = { ...cases[0], ageBand: "0-4" };
    delete legacy.suspectedCholera;
    delete legacy.caseDefinition;
    const parsed = caseRecordSchema.safeParse(legacy);
    expect(parsed.success && parsed.data.ageBand).toBe("unknown");
  });

  it("marks declared sub-counties in the cloud payload", () => {
    const snap = buildSnapshot(cases, SUB_COUNTIES, {
      now: NOW,
      windowDays: 7,
      baselineDays: 14,
      thresholds: { watch: 3, critical: 6 },
      declared: ["Riverside", "Nowhere"],
    });
    expect(snap.declared).toEqual(["Riverside"]);
    const rows = JSON.parse(snapshotToModelInput(snap)) as { subCounty: string; outbreakDeclared: boolean }[];
    expect(rows.find((r) => r.subCounty === "Riverside")?.outbreakDeclared).toBe(true);
    expect(rows.find((r) => r.subCounty === "Kilima")?.outbreakDeclared).toBe(false);
  });

  it("tells the intended story with default thresholds", () => {
    const snap = buildSnapshot(cases, SUB_COUNTIES, { now: NOW, windowDays: 7, baselineDays: 14, thresholds: { watch: 3, critical: 6 } });
    const status = Object.fromEntries(snap.statuses.map((s) => [s.subCounty, s.status]));
    expect(status["Riverside"]).toBe("CRITICAL");
    expect(overallStatus(snap.statuses)).toBe("CRITICAL");
    const riverside = snap.aggregates.find((a) => a.subCounty === "Riverside");
    expect(riverside?.choleraAlertRecent).toBeGreaterThanOrEqual(2);
    expect(riverside?.suspectedRecent).toBeGreaterThanOrEqual(2);
    const input = snapshotToModelInput(snap);
    expect(input).not.toMatch(/OP-[0-9A-Z]{8}/);
    expect(input).not.toContain("deidentifiedSummary");
  });
});

describe("epiCurve", () => {
  it("buckets by onset day and splits suspected cholera", () => {
    const base = { ageBand: "15-49" as const, symptoms: ["watery_diarrhoea" as const], dangerSigns: [], householdDeath: false };
    const cases = [
      { ...base, subCounty: "A", clientCreatedAt: NOW, onsetDaysAgo: 2, suspectedCholera: true },
      { ...base, subCounty: "A", clientCreatedAt: NOW, onsetDaysAgo: null, suspectedCholera: false },
      { ...base, subCounty: "B", clientCreatedAt: NOW - DAY_MS, onsetDaysAgo: 1, suspectedCholera: false },
      { ...base, subCounty: "A", clientCreatedAt: NOW - 40 * DAY_MS, onsetDaysAgo: 0 },
    ];
    const all = epiCurve(cases, { now: NOW, days: 21, subCounty: null });
    expect(all).toHaveLength(21);
    expect(all[20]).toMatchObject({ suspected: 0, other: 1 });
    expect(all[18]).toMatchObject({ suspected: 1, other: 1 });
    const onlyA = epiCurve(cases, { now: NOW, days: 21, subCounty: "A" });
    expect(onlyA.reduce((n, d) => n + d.suspected + d.other, 0)).toBe(2);
  });
});

describe("isSuspectedCholera", () => {
  const awd = { ageBand: "15-49" as const, symptoms: ["watery_diarrhoea" as const], householdDeath: false };
  it("uses the stored status when present", () => {
    expect(isSuspectedCholera({ ...awd, dangerSigns: [], suspectedCholera: true })).toBe(true);
    expect(isSuspectedCholera({ ...awd, dangerSigns: ["lethargic_or_unconscious"], suspectedCholera: false })).toBe(false);
  });
  it("classifies legacy records with the standard definition", () => {
    expect(isSuspectedCholera({ ...awd, dangerSigns: ["lethargic_or_unconscious"] })).toBe(true);
    expect(isSuspectedCholera({ ...awd, dangerSigns: [] })).toBe(false);
    expect(isSuspectedCholera({ ...awd, ageBand: "0-1", dangerSigns: ["lethargic_or_unconscious"] })).toBe(false);
  });
});
