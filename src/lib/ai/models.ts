/**
 * Firebase AI Logic model instances. Each inference mode is chosen for a privacy reason:
 *
 * - rawNoteModel      ONLY_ON_DEVICE   receives raw notes that may contain PII. The SDK can never
 *                                      fall back to the cloud with this instance.
 * - photoNoteModel    ONLY_ON_DEVICE   reads a photo of a paper note. A photo cannot be scrubbed
 *                                      before sending, so it has no cloud path at all.
 * - scrubbedNoteModel PREFER_ON_DEVICE receives deterministically scrubbed notes. Uses Gemini Nano
 *                                      when present and falls back to the cloud otherwise.
 * - sitrepModel       ONLY_IN_CLOUD    receives aggregated counts only. Population-level reasoning.
 */
import {
  AgentPlatformBackend,
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  type AI,
  type GenerativeModel,
} from "firebase/ai";
import { getFirebaseApp } from "@/lib/firebase/app";
import { extractionSchema, sitrepSchema, transcriptionSchema } from "./schemas";

export const CLOUD_EXTRACTION_MODEL = "gemini-3.5-flash-lite";

/**
 * Cloud backend used by Firebase AI Logic.
 * - "gemini-developer": Gemini Developer API, works on the Spark plan (free tier or AI Studio credits).
 * - "agent-platform":   Agent Platform Gemini API (formerly Vertex AI), billed to the Blaze plan.
 * Hybrid on-device inference behaves the same with both.
 */
export type AiBackendKind = "gemini-developer" | "agent-platform";

export const AI_BACKEND: AiBackendKind =
  process.env.NEXT_PUBLIC_AI_BACKEND === "agent-platform" ? "agent-platform" : "gemini-developer";

export const AI_BACKEND_LABELS: Record<AiBackendKind, string> = {
  "gemini-developer": "Gemini Developer API",
  "agent-platform": "Agent Platform Gemini API (Vertex AI), global location",
};

let ai: AI | null = null;
let rawNoteModel: GenerativeModel | null = null;
let scrubbedNoteModel: GenerativeModel | null = null;
let photoNoteModel: GenerativeModel | null = null;
const sitrepModels = new Map<string, GenerativeModel>();

function getAiInstance(): AI {
  if (!ai) {
    const backend = AI_BACKEND === "agent-platform" ? new AgentPlatformBackend("global") : new GoogleAIBackend();
    ai = getAI(getFirebaseApp(), { backend });
  }
  return ai;
}

const onDeviceParams = {
  createOptions: {
    expectedInputs: [{ type: "text" as const, languages: ["en"] }],
    expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
  },
  promptOptions: { responseConstraint: extractionSchema },
};

const inCloudExtractionParams = {
  model: CLOUD_EXTRACTION_MODEL,
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: extractionSchema,
    temperature: 0.1,
  },
};

export function getRawNoteModel(): GenerativeModel {
  if (!rawNoteModel) {
    rawNoteModel = getGenerativeModel(getAiInstance(), {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams,
    });
  }
  return rawNoteModel;
}

export function getPhotoNoteModel(): GenerativeModel {
  if (!photoNoteModel) {
    photoNoteModel = getGenerativeModel(getAiInstance(), {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: "text" as const, languages: ["en"] }, { type: "image" as const }],
          expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
        },
        promptOptions: { responseConstraint: transcriptionSchema },
      },
    });
  }
  return photoNoteModel;
}

/** Prepares the image-capable session. Must be called from a user gesture. */
export function preparePhotoModel(onProgress: (progress: number) => void): Promise<void> {
  return getPhotoNoteModel().initializeDeviceModel(onProgress);
}

export function getScrubbedNoteModel(): GenerativeModel {
  if (!scrubbedNoteModel) {
    scrubbedNoteModel = getGenerativeModel(getAiInstance(), {
      mode: InferenceMode.PREFER_ON_DEVICE,
      onDeviceParams,
      inCloudParams: inCloudExtractionParams,
    });
  }
  return scrubbedNoteModel;
}

export function getSitrepModel(modelName: string): GenerativeModel {
  let model = sitrepModels.get(modelName);
  if (!model) {
    model = getGenerativeModel(getAiInstance(), {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: sitrepSchema,
          temperature: 0.3,
        },
      },
    });
    sitrepModels.set(modelName, model);
  }
  return model;
}

/**
 * Starts (or resumes) the Gemini Nano download. Must be called from a user gesture.
 * Progress is reported between 0 and 1.
 */
export function prepareDeviceModel(onProgress: (progress: number) => void): Promise<void> {
  return getRawNoteModel().initializeDeviceModel(onProgress);
}
