/**
 * Gemini Nano availability through Chrome's Prompt API.
 * Firebase AI Logic performs the inference; this module only answers "can the raw note stay on the device?".
 */

export type DeviceAvailability = "available" | "downloadable" | "downloading" | "unavailable" | "unsupported";

interface PromptApiGlobal {
  LanguageModel?: {
    availability(options?: {
      expectedInputs?: { type: "text"; languages?: string[] }[];
      expectedOutputs?: { type: "text"; languages?: string[] }[];
    }): Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  };
}

export const DEVICE_LABELS: Record<DeviceAvailability, string> = {
  available: "Gemini Nano ready",
  downloadable: "Gemini Nano can be downloaded",
  downloading: "Gemini Nano is downloading",
  unavailable: "Gemini Nano unavailable on this device",
  unsupported: "Browser without the Prompt API",
};

export interface DeviceDiagnostics {
  /** Major Chrome version, or null for other browsers. */
  chromeVersion: number | null;
  /** True when the page can see the Prompt API (the Chrome flag is active). */
  promptApi: boolean;
}

export const MIN_CHROME_VERSION = 139;

export function getDeviceDiagnostics(): DeviceDiagnostics {
  if (typeof window === "undefined") return { chromeVersion: null, promptApi: false };
  const match = /Chrome\/(\d+)/.exec(navigator.userAgent);
  return {
    chromeVersion: match ? Number(match[1]) : null,
    promptApi: Boolean((globalThis as unknown as PromptApiGlobal).LanguageModel?.availability),
  };
}

export async function getDeviceAvailability(): Promise<DeviceAvailability> {
  if (typeof window === "undefined") return "unsupported";
  const api = (globalThis as unknown as PromptApiGlobal).LanguageModel;
  if (!api?.availability) return "unsupported";
  try {
    return await api.availability({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });
  } catch {
    return "unavailable";
  }
}
