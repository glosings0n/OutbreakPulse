/**
 * Runtime calls to Firebase AI Logic. Every call is timed and reports where inference ran.
 */
import { InferenceSource, type GenerativeModel } from "firebase/ai";
import { err, errorMessage, ok, type Result } from "@/lib/result";
import { getRawNoteModel, getScrubbedNoteModel, getSitrepModel } from "./models";
import { rawNotePrompt, scrubbedNotePrompt, sitrepPrompt } from "./prompts";
import { extractionZod, parseJson, sitrepZod, type AiExtraction, type AiSitrep } from "./schemas";

export type AiSource = "on_device" | "cloud";

export interface AiMeta {
  source: AiSource;
  latencyMs: number;
}

async function timedGenerate(
  model: GenerativeModel,
  prompt: string,
  fallbackSource: AiSource,
): Promise<{ text: string } & AiMeta> {
  const start = performance.now();
  const result = await model.generateContent(prompt);
  const latencyMs = Math.round(performance.now() - start);
  const reported = result.response.inferenceSource;
  const source: AiSource =
    reported === InferenceSource.ON_DEVICE ? "on_device" : reported === InferenceSource.IN_CLOUD ? "cloud" : fallbackSource;
  return { text: result.response.text(), source, latencyMs };
}

/** Raw note, Gemini Nano only. Never leaves the device. */
export async function extractFromRawNote(note: string): Promise<Result<AiExtraction & AiMeta>> {
  try {
    const r = await timedGenerate(getRawNoteModel(), rawNotePrompt(note), "on_device");
    if (r.source !== "on_device") {
      // Defensive: should be impossible with ONLY_ON_DEVICE. Treat as a hard failure.
      return err("unexpected_source", "Raw note inference did not run on the device.");
    }
    const parsed = parseJson(r.text, extractionZod);
    return parsed ? ok({ ...parsed, source: r.source, latencyMs: r.latencyMs }) : err("invalid_output", "The on-device model returned invalid JSON.");
  } catch (e) {
    return err("on_device_failed", errorMessage(e));
  }
}

/** Scrubbed note, hybrid: Gemini Nano when available, cloud otherwise. */
export async function extractFromScrubbedNote(scrubbedNote: string): Promise<Result<AiExtraction & AiMeta>> {
  try {
    const r = await timedGenerate(getScrubbedNoteModel(), scrubbedNotePrompt(scrubbedNote), "cloud");
    const parsed = parseJson(r.text, extractionZod);
    return parsed ? ok({ ...parsed, source: r.source, latencyMs: r.latencyMs }) : err("invalid_output", "The model returned invalid JSON.");
  } catch (e) {
    return err("hybrid_failed", errorMessage(e));
  }
}

export interface SitrepInput {
  county: string;
  windowDays: number;
  baselineDays: number;
  overallStatus: string;
  aggregateJson: string;
  modelName: string;
}

/** Aggregates only, cloud only. */
export async function generateSitrep(input: SitrepInput): Promise<Result<AiSitrep & AiMeta>> {
  try {
    const r = await timedGenerate(getSitrepModel(input.modelName), sitrepPrompt(input), "cloud");
    const parsed = parseJson(r.text, sitrepZod);
    return parsed ? ok({ ...parsed, source: r.source, latencyMs: r.latencyMs }) : err("invalid_output", "The cloud model returned an invalid report.");
  } catch (e) {
    return err("cloud_failed", errorMessage(e));
  }
}
