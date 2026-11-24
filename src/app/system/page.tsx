"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { EgressLedger } from "@/components/EgressLedger";
import {
  DEVICE_LABELS,
  getDeviceDiagnostics,
  getPhotoAvailability,
  MIN_CHROME_VERSION,
  type DeviceAvailability,
  type DeviceDiagnostics,
} from "@/lib/ai/device";
import { AI_BACKEND, AI_BACKEND_LABELS, prepareDeviceModel } from "@/lib/ai/models";
import { appCheckMode, isFirebaseConfigured } from "@/lib/firebase/app";
import { firestoreCacheMode } from "@/lib/firebase/firestore";
import { errorMessage } from "@/lib/result";

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1 border-b border-line py-3 last:border-0 sm:grid-cols-[220px_1fr]">
      <dt className="text-sm font-medium">{label}</dt>
      <dd className="text-[15px]">
        {value}
        {hint && <p className="hint mt-0.5">{hint}</p>}
      </dd>
    </div>
  );
}

export default function SystemPage() {
  const { device, refreshDevice, online, user, config, pendingSync, queuedEnrichments } = useApp();
  const [progress, setProgress] = useState<number | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [swState, setSwState] = useState("Checking...");
  const [diag, setDiag] = useState<DeviceDiagnostics | null>(null);
  const [photo, setPhoto] = useState<DeviceAvailability | null>(null);

  useEffect(() => {
    void getPhotoAvailability().then(setPhoto);
  }, [device]);

  useEffect(() => {
    const supported = "serviceWorker" in navigator;
    const registration = supported ? navigator.serviceWorker.getRegistration() : Promise.resolve(undefined);
    void registration.then((r) => {
      // Read after mount so the static HTML and the first client render match.
      setDiag(getDeviceDiagnostics());
      if (!supported) setSwState("Not supported");
      else setSwState(r?.active ? "Active, app shell cached for offline use" : "Not installed (installed in production builds)");
    });
  }, []);

  let diagnosis = "Checking this browser...";
  if (diag) {
    if (diag.chromeVersion === null) diagnosis = "This browser is not Chrome. On-device inference needs Chrome on a desktop computer.";
    else if (diag.chromeVersion < MIN_CHROME_VERSION)
      diagnosis = `This is Chrome ${diag.chromeVersion}. Update to version ${MIN_CHROME_VERSION} or later.`;
    else if (!diag.promptApi)
      diagnosis = `Chrome ${diag.chromeVersion} does not expose the Prompt API to this page yet: the flag below is not enabled, or Chrome was not relaunched after enabling it.`;
    else
      diagnosis = `Chrome ${diag.chromeVersion} exposes the Prompt API, but reports that Gemini Nano cannot run on this device (disk space, memory or graphics card below Chrome's requirements).`;
  }

  async function onPrepare() {
    setPrepError(null);
    setProgress(0);
    try {
      await prepareDeviceModel((p) => setProgress(p));
      setProgress(1);
    } catch (e) {
      setPrepError(errorMessage(e));
      setProgress(null);
    }
    await refreshDevice();
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">System</h1>
        <p className="mt-1 text-ink-2">Live view of the hybrid stack, for testers and judges.</p>
      </header>

      <EgressLedger />

      <section className="card" aria-labelledby="ai-title">
        <h2 id="ai-title" className="section-title">
          Hybrid inference
        </h2>
        <dl className="mt-2">
          <Row
            label="On-device model"
            value={DEVICE_LABELS[device]}
            hint="Chrome Prompt API, used through Firebase AI Logic. Raw notes are only ever sent to this model."
          />
          <Row label="Raw note model" value={<span className="mono">ONLY_ON_DEVICE</span>} hint="Cannot fall back to the cloud, by design." />
          <Row
            label="Paper note photo model"
            value={
              <>
                <span className="mono">ONLY_ON_DEVICE</span>, image input: {photo === null ? "checking..." : DEVICE_LABELS[photo]}
              </>
            }
            hint="A photo cannot be de-identified, so it has no cloud path. Needs chrome://flags/#prompt-api-for-gemini-nano-multimodal-input."
          />
          <Row label="De-identified note model" value={<span className="mono">PREFER_ON_DEVICE</span>} hint="Gemini Nano when present, cloud fallback otherwise." />
          <Row label="Situation report model" value={<span className="mono">ONLY_IN_CLOUD, {config.sitrepModel}</span>} hint="Receives aggregate counts only." />
          <Row label="Cloud backend" value={AI_BACKEND_LABELS[AI_BACKEND]} hint="Through Firebase AI Logic, protected by App Check." />
        </dl>
        {(device === "downloadable" || device === "downloading") && (
          <div className="mt-3">
            <button type="button" className="btn-primary" onClick={() => void onPrepare()} disabled={progress !== null && progress < 1}>
              Download Gemini Nano
            </button>
            {progress !== null && (
              <div className="mt-3 max-w-md">
                <div className="h-2 rounded-full bg-surface" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-2 rounded-full bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <p className="hint mt-1">
                  <span className="mono">{Math.round(progress * 100)}%</span> downloaded
                </p>
              </div>
            )}
          </div>
        )}
        {prepError && (
          <p role="alert" className="mt-3 rounded-md border border-high bg-high-surface px-3 py-2 text-sm text-high">
            {prepError}
          </p>
        )}
        {(device === "unsupported" || device === "unavailable") && (
          <div className="card-muted mt-3">
            <h3 className="text-sm font-medium">Why Gemini Nano is not ready</h3>
            <p className="mt-1 text-[15px]">{diagnosis}</p>
            <ol className="mt-3 grid list-decimal gap-1 pl-5 text-[15px]">
              <li>Use Chrome on a desktop computer, version {MIN_CHROME_VERSION} or later.</li>
              <li>
                Open <span className="mono">chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</span> and set it to Enabled.
              </li>
              <li>
                If this page then says the device is not supported, also set{" "}
                <span className="mono">chrome://flags/#optimization-guide-on-device-model</span> to Enabled BypassPerfRequirement.
              </li>
              <li>Relaunch Chrome, come back to this page and press Check again. A Download Gemini Nano button appears when Chrome allows it.</li>
              <li>Without Gemini Nano the app still works: de-identified notes use the cloud, and offline notes use the rules engine.</li>
            </ol>
            <button type="button" className="btn-secondary mt-3" onClick={() => void refreshDevice()}>
              Check again
            </button>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="fb-title">
        <h2 id="fb-title" className="section-title">
          Firebase services
        </h2>
        <dl className="mt-2">
          <Row label="Configuration" value={isFirebaseConfigured() ? "Configured" : "Missing, see README"} />
          <Row
            label="App Check"
            value={
              appCheckMode() === "debug"
                ? "Debug provider (local development)"
                : appCheckMode() === "recaptcha-enterprise"
                  ? "reCAPTCHA Enterprise (invisible score)"
                  : appCheckMode() === "recaptcha-v3"
                  ? "reCAPTCHA v3"
                  : "Not configured: AI features will be rejected"
            }
            hint="Required by Firebase AI Logic."
          />
          <Row label="Authentication" value={user ? `Guest session ${user.uid.slice(0, 6)}...` : "Signed out"} />
          <Row
            label="Firestore cache"
            value={isFirebaseConfigured() && user ? (firestoreCacheMode() === "persistent" ? "Persistent (IndexedDB), offline writes queued" : "Memory only") : "Not started"}
            hint={pendingSync === 1 ? "1 write pending sync" : `${pendingSync} writes pending sync`}
          />
          <Row
            label="Remote Config"
            value={`${config.source === "remote" ? "Fetched" : "Defaults"}: watch ${config.thresholds.watch}, critical ${config.thresholds.critical}, window ${config.windowDays} days, privacy gate ${config.privacyGateRequired ? "on" : "off"}`}
            hint="Updates in real time when changed in the Firebase console."
          />
          <Row label="AI review queue" value={queuedEnrichments === 1 ? "1 de-identified note waiting" : `${queuedEnrichments} de-identified notes waiting`} />
          <Row label="Network" value={online ? "Online" : "Offline"} />
          <Row label="Service worker" value={swState} />
        </dl>
      </section>
    </div>
  );
}
