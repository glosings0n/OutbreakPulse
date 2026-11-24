import { describe, expect, it } from "vitest";
import { evaluateRules, mergeRisk, type ClinicalFields } from "./rules";

const base: ClinicalFields = {
  ageBand: "15-49",
  symptoms: [],
  dangerSigns: [],
  householdContact: false,
  householdDeath: false,
  onsetDaysAgo: 1,
};

describe("evaluateRules", () => {
  it("is LOW without outbreak criteria", () => {
    expect(evaluateRules({ ...base, symptoms: ["fever"] }).riskLevel).toBe("LOW");
  });

  it("is LOW for isolated watery diarrhoea in an adult", () => {
    const r = evaluateRules({ ...base, symptoms: ["watery_diarrhoea"] });
    expect(r.riskLevel).toBe("LOW");
    expect(r.meetsSuspectedCaseDefinition).toBe(false);
  });

  it("is MEDIUM for watery diarrhoea with vomiting", () => {
    expect(evaluateRules({ ...base, symptoms: ["watery_diarrhoea", "vomiting"] }).riskLevel).toBe("MEDIUM");
  });

  it("is MEDIUM for watery diarrhoea with a sick household contact and meets the case definition", () => {
    const r = evaluateRules({ ...base, symptoms: ["watery_diarrhoea"], householdContact: true });
    expect(r.riskLevel).toBe("MEDIUM");
    expect(r.meetsSuspectedCaseDefinition).toBe(true);
  });

  it("is HIGH with two dehydration signs", () => {
    const r = evaluateRules({ ...base, symptoms: ["watery_diarrhoea"], dangerSigns: ["sunken_eyes", "slow_skin_pinch"] });
    expect(r.riskLevel).toBe("HIGH");
    expect(r.severeDehydration).toBe(true);
  });

  it("is HIGH with a single life-threatening sign", () => {
    expect(evaluateRules({ ...base, symptoms: ["watery_diarrhoea"], dangerSigns: ["unable_to_drink"] }).riskLevel).toBe("HIGH");
  });

  it("is HIGH for a child under five with any danger sign", () => {
    expect(
      evaluateRules({ ...base, ageBand: "0-4", symptoms: ["watery_diarrhoea"], dangerSigns: ["sunken_eyes"] }).riskLevel,
    ).toBe("HIGH");
  });

  it("is HIGH when a household death is reported", () => {
    expect(evaluateRules({ ...base, symptoms: ["watery_diarrhoea"], householdDeath: true }).riskLevel).toBe("HIGH");
  });

  it("always returns reasons and actions", () => {
    const r = evaluateRules(base);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.recommendedActions.length).toBeGreaterThan(0);
  });
});

describe("mergeRisk", () => {
  const high = evaluateRules({ ...base, symptoms: ["watery_diarrhoea"], dangerSigns: ["unable_to_drink"] });
  const low = evaluateRules({ ...base, symptoms: ["watery_diarrhoea"] });

  it("never lets AI lower the rules level", () => {
    const m = mergeRisk(high, { riskLevel: "LOW", reason: "Looks mild" });
    expect(m.riskLevel).toBe("HIGH");
    expect(m.raisedByAi).toBe(false);
  });

  it("lets AI raise the level with a reason", () => {
    const m = mergeRisk(low, { riskLevel: "MEDIUM", reason: "Neighbour with similar illness" });
    expect(m.riskLevel).toBe("MEDIUM");
    expect(m.raisedByAi).toBe(true);
    expect(m.reasons.at(-1)).toContain("Raised by AI review");
  });

  it("ignores an AI raise without a reason", () => {
    expect(mergeRisk(low, { riskLevel: "HIGH", reason: "  " }).riskLevel).toBe("LOW");
  });

  it("keeps rules when there is no AI opinion", () => {
    expect(mergeRisk(low, null).riskLevel).toBe("LOW");
  });
});
