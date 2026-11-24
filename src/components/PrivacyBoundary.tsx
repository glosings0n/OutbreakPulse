import type { InferenceRoute } from "@/lib/cases/types";

interface Props {
  route: InferenceRoute;
  rawNote: string;
  cloudPayload: string | null;
  redactionCount: number;
  queuedForLater: boolean;
}

/** Makes the privacy boundary visible: what stayed on the device versus what left it. */
export function PrivacyBoundary({ route, rawNote, cloudPayload, redactionCount, queuedForLater }: Props) {
  let cloudText: string;
  if (cloudPayload) cloudText = cloudPayload;
  else if (route === "on_device") cloudText = "Nothing. The note was analyzed by Gemini Nano on this device.";
  else if (queuedForLater) cloudText = "Nothing yet. The de-identified note is queued for AI review when the connection returns.";
  else cloudText = "Nothing. The note was analyzed by the local rules engine.";

  return (
    <section aria-labelledby="privacy-title" className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="privacy-title" className="section-title">
          Privacy boundary
        </h2>
        <p className="hint">
          <span className="mono">{redactionCount}</span> identifying {redactionCount === 1 ? "detail" : "details"} removed
        </p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-line bg-surface p-3">
          <h3 className="text-sm font-medium text-ink">Stays on this device</h3>
          <p className="hint mb-2">Original note. Never stored or uploaded.</p>
          <p className="whitespace-pre-wrap break-words text-[15px]">{rawNote}</p>
        </div>
        <div className={`rounded-md border p-3 ${cloudPayload ? "border-medium bg-medium-surface" : "border-line bg-bg"}`}>
          <h3 className="text-sm font-medium text-ink">Sent to the cloud model</h3>
          <p className="hint mb-2">Exact text that left the device for AI analysis.</p>
          <p className={`whitespace-pre-wrap break-words text-[15px] ${cloudPayload ? "mono text-sm" : "text-ink-2"}`}>{cloudText}</p>
        </div>
      </div>
    </section>
  );
}
