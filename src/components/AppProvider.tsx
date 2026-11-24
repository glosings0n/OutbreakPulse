"use client";

import type { User } from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getDeviceAvailability, type DeviceAvailability } from "@/lib/ai/device";
import type { CaseView } from "@/lib/cases/types";
import { isFirebaseConfigured } from "@/lib/firebase/app";
import { signInAsGuest, watchUser } from "@/lib/firebase/auth";
import { watchCases } from "@/lib/firebase/firestore";
import { REMOTE_DEFAULTS, refreshConfig, watchConfig, type AppConfig } from "@/lib/firebase/remote-config";
import { processEnrichmentQueue } from "@/lib/offline/enrich";
import { listJobs } from "@/lib/offline/queue";
import { useOnline } from "@/lib/hooks";
import { errorMessage } from "@/lib/result";

const DEFAULT_CONFIG: AppConfig = {
  windowDays: REMOTE_DEFAULTS.cluster_window_days,
  baselineDays: REMOTE_DEFAULTS.cluster_baseline_days,
  thresholds: {
    watch: REMOTE_DEFAULTS.cluster_watch_threshold,
    critical: REMOTE_DEFAULTS.cluster_critical_threshold,
  },
  sitrepModel: REMOTE_DEFAULTS.sitrep_model,
  privacyGateRequired: REMOTE_DEFAULTS.privacy_gate_required,
  source: "default",
};

interface AppState {
  configured: boolean;
  authReady: boolean;
  user: User | null;
  online: boolean;
  device: DeviceAvailability;
  config: AppConfig;
  cases: CaseView[];
  casesError: string | null;
  pendingSync: number;
  queuedEnrichments: number;
  signInGuest: () => Promise<void>;
  refreshDevice: () => Promise<void>;
  refreshQueue: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const [authReady, setAuthReady] = useState(!configured);
  const [user, setUser] = useState<User | null>(null);
  const online = useOnline();
  const [device, setDevice] = useState<DeviceAvailability>("unsupported");
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [cases, setCases] = useState<CaseView[]>([]);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(0);
  const [queuedEnrichments, setQueuedEnrichments] = useState(0);

  const refreshDevice = useCallback(async () => {
    setDevice(await getDeviceAvailability());
  }, []);

  const refreshQueue = useCallback(async () => {
    try {
      setQueuedEnrichments((await listJobs()).length);
    } catch {
      setQueuedEnrichments(0);
    }
  }, []);

  // Gemini Nano availability.
  useEffect(() => {
    let cancelled = false;
    void getDeviceAvailability().then((d) => {
      if (!cancelled) setDevice(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Service worker (production builds only, so development hot reload is not cached).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Offline caching is an enhancement; the app still works online without it.
    });
  }, []);

  // Auth + Remote Config.
  useEffect(() => {
    if (!configured) return;
    const unsubscribeUser = watchUser((u) => {
      setUser(u);
      setAuthReady(true);
    });
    void refreshConfig().then(setConfig);
    const unsubscribeConfig = watchConfig(setConfig);
    return () => {
      unsubscribeUser();
      unsubscribeConfig();
    };
  }, [configured]);

  // Live cases with pending-sync metadata.
  useEffect(() => {
    if (!user) return;
    const unsubscribe = watchCases(
      user.uid,
      (list, pending) => {
        setCases(list);
        setPendingSync(pending);
        setCasesError(null);
      },
      (e) => setCasesError(errorMessage(e)),
    );
    return () => {
      unsubscribe();
      setCases([]);
      setPendingSync(0);
    };
  }, [user]);

  // Deferred AI enrichment replays when the connection returns.
  useEffect(() => {
    if (!user || !online) return;
    let cancelled = false;
    void (async () => {
      await processEnrichmentQueue();
      if (!cancelled) await refreshQueue();
    })();
    return () => {
      cancelled = true;
    };
  }, [user, online, refreshQueue]);

  const signInGuest = useCallback(async () => {
    await signInAsGuest();
  }, []);

  const value = useMemo<AppState>(
    () => ({
      configured,
      authReady,
      user,
      online,
      device,
      config,
      cases,
      casesError,
      pendingSync,
      queuedEnrichments,
      signInGuest,
      refreshDevice,
      refreshQueue,
    }),
    [configured, authReady, user, online, device, config, cases, casesError, pendingSync, queuedEnrichments, signInGuest, refreshDevice, refreshQueue],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
