import { formatMs } from "@/lib/format";
import type { InferenceRoute } from "@/lib/cases/types";
import { INFERENCE_ROUTE_LABELS } from "@/lib/cases/types";
import { ALERT_LABELS, type AlertStatus } from "@/lib/surveillance/detect";
import { RISK_LABELS, type RiskLevel } from "@/lib/triage/vocabulary";

const RISK_CLASSES: Record<RiskLevel, string> = {
  LOW: "border-low text-low bg-low-surface",
  MEDIUM: "border-medium text-medium bg-medium-surface",
  HIGH: "border-high text-high bg-high-surface",
};

export function RiskBadge({ level, size = "md" }: { level: RiskLevel; size?: "md" | "lg" }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border font-medium ${RISK_CLASSES[level]} ${
        size === "lg" ? "px-3 py-1.5 text-base" : "px-2 py-0.5 text-sm"
      }`}
    >
      {RISK_LABELS[level]}
    </span>
  );
}

const ALERT_CLASSES: Record<AlertStatus, string> = {
  NORMAL: "border-low text-low bg-low-surface",
  WATCH: "border-medium text-medium bg-medium-surface",
  CRITICAL: "border-high text-high bg-high-surface",
};

export function AlertBadge({ status }: { status: AlertStatus }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-medium ${ALERT_CLASSES[status]}`}>
      {ALERT_LABELS[status]}
    </span>
  );
}

const ROUTE_CLASSES: Record<InferenceRoute, string> = {
  on_device: "border-brand text-brand bg-brand-surface",
  cloud: "border-line text-ink bg-surface",
  rules_only: "border-line text-ink-2 bg-bg",
};

/** Shows where inference actually ran and how long it took. */
export function InferenceBadge({ route, latencyMs }: { route: InferenceRoute; latencyMs: number | null }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border px-2 py-0.5 text-sm ${ROUTE_CLASSES[route]}`}
      title="Where inference ran for this case"
    >
      <span className="font-medium">{INFERENCE_ROUTE_LABELS[route]}</span>
      {latencyMs !== null && <span className="mono text-xs">{formatMs(latencyMs)}</span>}
    </span>
  );
}

export function SyncBadge({ pending }: { pending: boolean }) {
  return pending ? (
    <span className="inline-flex items-center rounded-md border border-medium bg-medium-surface px-2 py-0.5 text-sm text-medium">
      Pending sync
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md border border-line bg-surface px-2 py-0.5 text-sm text-ink-2">Synced</span>
  );
}
