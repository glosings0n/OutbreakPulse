import {
  activate,
  fetchAndActivate,
  getBoolean,
  getNumber,
  getRemoteConfig,
  getString,
  onConfigUpdate,
  type RemoteConfig,
} from "firebase/remote-config";
import { normalizeThresholds, type Thresholds } from "@/lib/surveillance/detect";
import { getFirebaseApp } from "./app";

export const REMOTE_DEFAULTS = {
  cluster_window_days: 7,
  cluster_baseline_days: 14,
  cluster_watch_threshold: 3,
  cluster_critical_threshold: 6,
  sitrep_model: "gemini-3.8-flash",
  privacy_gate_required: true,
} as const;

export interface AppConfig {
  windowDays: number;
  baselineDays: number;
  thresholds: Thresholds;
  sitrepModel: string;
  privacyGateRequired: boolean;
  /** "remote" when at least one fetch has been activated, "default" otherwise. */
  source: "remote" | "default";
}

let rc: RemoteConfig | null = null;

function instance(): RemoteConfig {
  if (!rc) {
    rc = getRemoteConfig(getFirebaseApp());
    rc.settings.minimumFetchIntervalMillis = 60_000;
    rc.settings.fetchTimeoutMillis = 8_000;
    rc.defaultConfig = { ...REMOTE_DEFAULTS };
  }
  return rc;
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function readConfig(): AppConfig {
  const r = instance();
  const model = getString(r, "sitrep_model").trim();
  return {
    windowDays: clampInt(getNumber(r, "cluster_window_days"), 1, 30, REMOTE_DEFAULTS.cluster_window_days),
    baselineDays: clampInt(getNumber(r, "cluster_baseline_days"), 0, 60, REMOTE_DEFAULTS.cluster_baseline_days),
    thresholds: normalizeThresholds(
      getNumber(r, "cluster_watch_threshold"),
      getNumber(r, "cluster_critical_threshold"),
    ),
    sitrepModel: /^gemini-[a-z0-9.-]+$/.test(model) ? model : REMOTE_DEFAULTS.sitrep_model,
    privacyGateRequired: getBoolean(r, "privacy_gate_required"),
    source: r.lastFetchStatus === "success" ? "remote" : "default",
  };
}

/** Fetches and activates. Never throws: offline, the cached or default values are used. */
export async function refreshConfig(): Promise<AppConfig> {
  try {
    await fetchAndActivate(instance());
  } catch {
    // Offline or throttled: keep the last activated values.
  }
  return readConfig();
}

/** Real-time updates: a threshold changed in the console reaches open dashboards within seconds. */
export function watchConfig(onChange: (config: AppConfig) => void): () => void {
  try {
    return onConfigUpdate(instance(), {
      next: () => {
        void activate(instance()).then(() => onChange(readConfig()));
      },
      error: () => {
        // Real-time stream errors are non-fatal; polling on load still works.
      },
      complete: () => {},
    });
  } catch {
    return () => {};
  }
}
