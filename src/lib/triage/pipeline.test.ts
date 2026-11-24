import { describe, expect, it, vi } from "vitest";
import { caseRecordSchema } from "@/lib/cases/types";
import { err, ok } from "@/lib/result";
import type { AiExtraction } from "@/lib/ai/schemas";
import type { AiMeta } from "@/lib/ai/tasks";
import { extractByKeywords } from "./extract";
import { analyzeNote, buildCaseRecord, decideRoute, prepareNote, sanitizeSummary, type AiDeps } from "./pipeline";

const RAW =
  "Visited Amani Kato 0712 345 678 in Riverside. 7 year old boy, watery diarrhoea and vomiting for 2 days, sunken eyes, unable to drink. Brother also sick.";

const aiOutput = (overrides: Partial<AiExtraction & AiMeta> = {}): AiExtraction & AiMeta => ({
  ageBand: "5-14",
  sex: "male",
  onsetDaysAgo: 2,
  symptoms: ["watery_diarrhoea", "vomiting"],
  dangerSigns: ["sunken_eyes", "unable_to_drink"],
  householdContact: true,
  householdDeath: false,
  piiStrings: ["Amani Kato", "0712 345 678"],
  summary: "Child with watery diarrhoea seen by Amani Kato, severe dehydration.",
  riskOpinion: "HIGH",
  riskReason: "Severe dehydration",
  source: "on_device",
  latencyMs: 412,
  ...overrides,
});

describe("decideRoute", () => {
  const base = { online: true, cloudConsent: null, privacyGateRequired: true } as const;
  it("keeps the raw note on the device when Gemini Nano is available", () => {
    expect(decideRoute({ ...base, device: "available", online: false })).toEqual({ kind: "on_device" });
  });
  it("falls back to rules when offline without Nano", () => {
    expect(decideRoute({ ...base, device: "unsupported", online: false })).toEqual({ kind: "rules_only", reason: "offline" });
  });
  it("asks for consent before any cloud call", () => {
    expect(decideRoute({ ...base, device: "downloadable" })).toEqual({ kind: "needs_consent" });
    expect(decideRoute({ ...base, device: "downloadable", cloudConsent: true })).toEqual({ kind: "cloud" });
    expect(decideRoute({ ...base, device: "downloadable", cloudConsent: false })).toEqual({ kind: "rules_only", reason: "declined" });
  });
  it("skips the gate when Remote Config disables it", () => {
    expect(decideRoute({ ...base, device: "unavailable", privacyGateRequired: false })).toEqual({ kind: "cloud" });
  });
});

describe("prepareNote", () => {
  it("scrubs before extracting keywords", () => {
    const p = prepareNote(RAW);
    expect(p.scrubbedText).not.toContain("0712");
    expect(p.scrubbedText).not.toContain("Amani");
    expect(p.redactionCount).toBeGreaterThanOrEqual(2);
    expect(p.keywordFields.symptoms).toContain("watery_diarrhoea");
    expect(p.keywordFields.subCounty).toBe("Riverside");
  });
});

describe("analyzeNote", () => {
  it("sends the raw note only to the on-device model and never to the hybrid one", async () => {
    const deps: AiDeps = {
      extractFromRawNote: vi.fn(async () => ok(aiOutput())),
      extractFromScrubbedNote: vi.fn(async () => ok(aiOutput({ source: "cloud" }))),
    };
    const draft = await analyzeNote(RAW, prepareNote(RAW), { kind: "on_device" }, deps);
    expect(deps.extractFromRawNote).toHaveBeenCalledWith(RAW);
    expect(deps.extractFromScrubbedNote).not.toHaveBeenCalled();
    expect(draft.route).toBe("on_device");
    expect(draft.cloudPayload).toBeNull();
    expect(draft.summary).not.toContain("Amani");
  });

  it("sends only the scrubbed note on the cloud route and exposes the exact payload", async () => {
    const deps: AiDeps = {
      extractFromRawNote: vi.fn(async () => ok(aiOutput())),
      extractFromScrubbedNote: vi.fn(async () => ok(aiOutput({ source: "cloud", piiStrings: [] }))),
    };
    const prepared = prepareNote(RAW);
    const draft = await analyzeNote(RAW, prepared, { kind: "cloud" }, deps);
    const sent = vi.mocked(deps.extractFromScrubbedNote).mock.calls[0][0];
    expect(sent).toBe(prepared.scrubbedText);
    expect(sent).not.toContain("0712");
    expect(sent).not.toContain("Amani");
    expect(deps.extractFromRawNote).not.toHaveBeenCalled();
    expect(draft.cloudPayload).toBe(prepared.scrubbedText);
    expect(draft.route).toBe("cloud");
  });

  it("falls back to the rules tier when AI fails", async () => {
    const deps: AiDeps = {
      extractFromRawNote: vi.fn(async () => err("on_device_failed", "boom")),
      extractFromScrubbedNote: vi.fn(async () => err("x", "y")),
    };
    const draft = await analyzeNote(RAW, prepareNote(RAW), { kind: "on_device" }, deps);
    expect(draft.route).toBe("rules_only");
    expect(draft.aiError).toBe("boom");
    expect(draft.fields.symptoms).toContain("watery_diarrhoea");
    expect(draft.cloudPayload).toBeNull();
  });

  it("still reports the de-identified payload when a cloud call fails", async () => {
    const deps: AiDeps = {
      extractFromRawNote: vi.fn(async () => err("x", "y")),
      extractFromScrubbedNote: vi.fn(async () => err("cloud_failed", "quota")),
    };
    const prepared = prepareNote(RAW);
    const draft = await analyzeNote(RAW, prepared, { kind: "cloud" }, deps);
    expect(draft.route).toBe("rules_only");
    expect(draft.cloudPayload).toBe(prepared.scrubbedText);
    expect(draft.cloudPayload).not.toContain("555");
  });
});

describe("buildCaseRecord", () => {
  it("produces a valid, de-identified record with the rules floor", () => {
    const fields = { ...extractByKeywords(prepareNote(RAW).scrubbedText), subCounty: "Riverside" as const };
    const record = buildCaseRecord({
      caseId: "OP-ABCDEFGH",
      workspaceId: "w1",
      agentUid: "u1",
      county: "Lakeshore County",
      subCounty: "Riverside",
      fields,
      summary: "Seen by Amani, call 0712 345 678",
      route: "rules_only",
      latencyMs: null,
      redactionCount: 2,
      aiRisk: { riskLevel: "LOW", reason: "mild" },
      now: 1_700_000_000_000,
    });
    expect(caseRecordSchema.safeParse(record).success).toBe(true);
    expect(record.riskLevel).toBe("HIGH");
    expect(record.rulesRiskLevel).toBe("HIGH");
    expect(record.deidentifiedSummary).not.toContain("0712");
    expect(JSON.stringify(record)).not.toContain("Amani Kato");
  });
});

describe("sanitizeSummary", () => {
  it("removes model-reported PII and bounds length", () => {
    const s = sanitizeSummary("Patient Juma Otieno has AWD. ".repeat(30), ["Juma Otieno"]);
    expect(s.text).not.toContain("Juma");
    expect(s.text.length).toBeLessThanOrEqual(280);
  });
});
