import { describe, expect, it } from "vitest";
import type { AiExtraction } from "@/lib/ai/schemas";
import type { AiMeta } from "@/lib/ai/tasks";
import { ok } from "@/lib/result";
import { EVAL_NOTES } from "./dataset";
import { presentIdentifiers, runAiTier, runRulesTier, scoreOutcomes, type TierScore } from "./evaluate";
import { HOLDOUT_NOTES } from "./holdout";

function summarize(score: TierScore) {
  return {
    piiRemoved: `${score.piiRemoved}/${score.piiPlanted}`,
    piiSentToCloud: score.piiSentToCloud,
    symptomF1: score.symptomF1.toFixed(2),
    dangerSignF1: score.dangerSignF1.toFixed(2),
    fieldAccuracy: score.fieldAccuracy.toFixed(2),
    riskAgreement: score.riskAgreement.toFixed(2),
    underTriage: score.underTriage,
    suspectedAgreement: score.suspectedAgreement.toFixed(2),
  };
}

describe("evaluation dataset", () => {
  it("has unique ids and planted identifiers that occur in the note", () => {
    const all = [...EVAL_NOTES, ...HOLDOUT_NOTES];
    expect(new Set(all.map((n) => n.id)).size).toBe(all.length);
    for (const n of all) {
      for (const p of n.pii) expect(n.text).toContain(p);
    }
  });
});

describe("deterministic tier", () => {
  const outcomes = EVAL_NOTES.map(runRulesTier);
  const score = scoreOutcomes(EVAL_NOTES, outcomes);

  it("removes every structured identifier (phones, emails, IDs, GPS, dates of birth, addresses)", () => {
    const structured = /\d|@/;
    for (const note of EVAL_NOTES) {
      const o = outcomes.find((x) => x.id === note.id);
      const leaked = presentIdentifiers(o?.deidentifiedText ?? "", note.pii.filter((p) => structured.test(p)));
      expect(leaked, note.id).toEqual([]);
    }
  });

  it("never stores an identifier in the summary", () => {
    expect(score.piiStored).toBe(0);
  });

  it("reports a score for every note", () => {
    expect(score.notes).toBe(EVAL_NOTES.length);
    expect(score.failed).toBe(0);
    expect(score.symptomF1).toBeGreaterThan(0.5);
  });

  it("snapshot of the measured numbers", () => {
    expect(summarize(score)).toMatchInlineSnapshot(`
      {
        "dangerSignF1": "0.80",
        "fieldAccuracy": "0.82",
        "piiRemoved": "40/40",
        "piiSentToCloud": 0,
        "riskAgreement": "0.83",
        "suspectedAgreement": "0.92",
        "symptomF1": "0.93",
        "underTriage": 3,
      }
    `);
  });
});

describe("deterministic tier on the held-out set", () => {
  it("snapshot of the measured numbers", () => {
    const score = scoreOutcomes(HOLDOUT_NOTES, HOLDOUT_NOTES.map(runRulesTier));
    expect(summarize(score)).toMatchInlineSnapshot(`
      {
        "dangerSignF1": "0.63",
        "fieldAccuracy": "0.75",
        "piiRemoved": "25/26",
        "piiSentToCloud": 1,
        "riskAgreement": "0.75",
        "suspectedAgreement": "0.83",
        "symptomF1": "0.95",
        "underTriage": 2,
      }
    `);
  });
});

describe("AI tiers", () => {
  const perfect = (id: string): AiExtraction & AiMeta => {
    const note = EVAL_NOTES.find((n) => n.id === id);
    if (!note) throw new Error(id);
    return {
      ...note.truth,
      onsetDaysAgo: -1,
      summary: "Watery diarrhoea.",
      riskOpinion: "LOW",
      riskReason: "",
      piiStrings: note.pii,
      source: "on_device",
      latencyMs: 100,
    };
  };

  it("scores a perfect on-device model as perfect, with nothing sent to the cloud", async () => {
    const outcomes = await Promise.all(
      EVAL_NOTES.map((n) =>
        runAiTier("on_device", n, {
          extractFromRawNote: async () => ok(perfect(n.id)),
          extractFromScrubbedNote: async () => ok(perfect(n.id)),
        }),
      ),
    );
    const s = scoreOutcomes(EVAL_NOTES, outcomes);
    expect(s.piiRemoved).toBe(s.piiPlanted);
    expect(s.piiSentToCloud).toBe(0);
    expect(s.underTriage).toBe(0);
    expect(s.dangerSignF1).toBeGreaterThan(0.8);
    expect(s.latencyMedianMs).toBe(100);
  });

  it("counts identifiers left in a de-identified note that went to the cloud", async () => {
    const note = EVAL_NOTES[1];
    const o = await runAiTier("hybrid", note, {
      extractFromRawNote: async () => ok(perfect(note.id)),
      extractFromScrubbedNote: async () => ok({ ...perfect(note.id), piiStrings: [], source: "cloud" }),
    });
    const s = scoreOutcomes([note], [o]);
    expect(s.sources.cloud).toBe(1);
    expect(s.piiSentToCloud).toBe(presentIdentifiers(o.outboundText, note.pii).length);
  });
});
