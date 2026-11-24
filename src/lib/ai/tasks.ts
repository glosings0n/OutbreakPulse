/**
 * Runtime calls to Firebase AI Logic. Every call is timed, reports where inference ran,
 * and is recorded in the device egress ledger.
 */
import { InferenceSource, type GenerativeModel } from "firebase/ai";
import { byteSize, recordEgress } from "@/lib/egress/ledger";
import { err, errorMessage, ok, type Result } from "@/lib/result";
import { CLOUD_EXTRACTION_MODEL, getPhotoNoteModel, getRawNoteModel, getScrubbedNoteModel, getSitrepModel } from "./models";
import { PHOTO_TRANSCRIPTION_PROMPT, rawNotePrompt, scrubbedNotePrompt, sitrepPrompt } from "./prompts";
import {
  extractionZod,
  parseJson,
  sitrepZod,
  transcriptionZod,
  type AiExtraction,
  type AiSitrep,
  type AiTranscription,
} from "./schemas";

export type AiSource = "on_device" | "cloud";

export interface AiMeta {
  source: AiSource;
  latencyMs: number;
}

interface EgressInfo {
  /** What the call carries, in plain words. */
  description: string;
  /** Cloud model name, when the call can reach the cloud. */
  cloudModel: string | null;
  /** The de-identified or aggregate content, recorded only when it leaves the device. Never a raw note. */
  auditable: string | null;
  /** Total prompt size, counted when the call leaves the device. */
  promptBytes: number;
}

function recordCall(info: EgressInfo, source: AiSource, failed: boolean): void {
  const left = source === "cloud";
  recordEgress({
    channel: "ai",
    destination: left ? `Gemini in the cloud (${info.cloudModel ?? "unknown model"})` : "Gemini Nano on this device",
    description: `${info.description}${failed ? ", failed" : ""}`,
    bytes: left ? info.promptBytes : 0,
    leftDevice: left,
    detail: left ? (info.auditable ?? undefined) : undefined,
  });
}

async function timedGenerate(
  model: GenerativeModel,
  prompt: Parameters<GenerativeModel["generateContent"]>[0],
  fallbackSource: AiSource,
  egress: EgressInfo,
): Promise<{ text: string } & AiMeta> {
  const start = performance.now();
  let result: Awaited<ReturnType<GenerativeModel["generateContent"]>>;
  try {
    result = await model.generateContent(prompt);
  } catch (e) {
    // Where a failed call ran is unknown; record the conservative answer for calls that can reach the cloud.
    recordCall(egress, egress.cloudModel ? "cloud" : "on_device", true);
    throw e;
  }
  const latencyMs = Math.round(performance.now() - start);
  const reported = result.response.inferenceSource;
  const source: AiSource =
    reported === InferenceSource.ON_DEVICE ? "on_device" : reported === InferenceSource.IN_CLOUD ? "cloud" : fallbackSource;
  recordCall(egress, source, false);
  return { text: result.response.text(), source, latencyMs };
}

/** Raw note, Gemini Nano only. Never leaves the device. */
export async function extractFromRawNote(note: string): Promise<Result<AiExtraction & AiMeta>> {
  try {
    const r = await timedGenerate(getRawNoteModel(), rawNotePrompt(note), "on_device", {
      description: "Raw field note, analyzed locally",
      cloudModel: null,
      auditable: null,
      promptBytes: 0,
    });
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

/** Photo of a paper note, Gemini Nano only. The image never leaves the device and is not stored. */
export async function transcribeNotePhoto(image: { mimeType: "image/jpeg" | "image/png"; base64: string }): Promise<
  Result<AiTranscription & AiMeta>
> {
  try {
    const r = await timedGenerate(
      getPhotoNoteModel(),
      [PHOTO_TRANSCRIPTION_PROMPT, { type: "inlineData", inlineData: { mimeType: image.mimeType, data: image.base64 } }],
      "on_device",
      { description: "Photo of a paper note, read locally", cloudModel: null, auditable: null, promptBytes: 0 },
    );
    if (r.source !== "on_device") return err("unexpected_source", "Photo reading did not run on the device.");
    const parsed = parseJson(r.text, transcriptionZod);
    return parsed ? ok({ ...parsed, source: r.source, latencyMs: r.latencyMs }) : err("invalid_output", "The on-device model returned invalid JSON.");
  } catch (e) {
    return err("on_device_failed", errorMessage(e));
  }
}

/** Scrubbed note, hybrid: Gemini Nano when available, cloud otherwise. */
export async function extractFromScrubbedNote(scrubbedNote: string): Promise<Result<AiExtraction & AiMeta>> {
  try {
    const prompt = scrubbedNotePrompt(scrubbedNote);
    const r = await timedGenerate(getScrubbedNoteModel(), prompt, "cloud", {
      description: "De-identified field note for extraction",
      cloudModel: CLOUD_EXTRACTION_MODEL,
      auditable: scrubbedNote,
      promptBytes: byteSize(prompt),
    });
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
    const prompt = sitrepPrompt(input);
    const r = await timedGenerate(getSitrepModel(input.modelName), prompt, "cloud", {
      description: "Aggregate counts per sub-county for the situation report",
      cloudModel: input.modelName,
      auditable: input.aggregateJson,
      promptBytes: byteSize(prompt),
    });
    const parsed = parseJson(r.text, sitrepZod);
    return parsed ? ok({ ...parsed, source: r.source, latencyMs: r.latencyMs }) : err("invalid_output", "The cloud model returned an invalid report.");
  } catch (e) {
    return err("cloud_failed", errorMessage(e));
  }
}
