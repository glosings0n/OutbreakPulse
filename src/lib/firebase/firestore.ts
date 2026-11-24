/**
 * Firestore with persistent local cache. Writes made offline are queued in IndexedDB
 * and flushed automatically when the connection returns.
 */
import {
  collection,
  doc,
  getDocs,
  initializeFirestore,
  limit,
  memoryLocalCache,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { caseRecordSchema, type CaseRecord, type CaseView } from "@/lib/cases/types";
import { getFirebaseApp } from "./app";

let db: Firestore | null = null;
let cacheMode: "persistent" | "memory" = "persistent";

export function getDb(): Firestore {
  if (db) return db;
  const app = getFirebaseApp();
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // IndexedDB unavailable (for example some private windows): degrade to memory cache.
    cacheMode = "memory";
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
  }
  return db;
}

export function firestoreCacheMode(): "persistent" | "memory" {
  return cacheMode;
}

/**
 * Saves a case without awaiting the server acknowledgement.
 * The returned promise resolves when the write is committed to the server; callers must NOT await it
 * on the submission path, otherwise the UI would hang while offline.
 */
export function saveCase(record: CaseRecord): { serverAck: Promise<void> } {
  const parsed = caseRecordSchema.parse(record);
  const ref = doc(getDb(), "cases", parsed.caseId);
  const serverAck = setDoc(ref, { ...parsed, createdAt: serverTimestamp() });
  return { serverAck };
}

export function updateCaseEnrichment(
  caseId: string,
  patch: Pick<CaseRecord, "riskLevel" | "riskReasons" | "deidentifiedSummary" | "recommendedActions" | "inferenceSource" | "latencyMs">,
): Promise<void> {
  return updateDoc(doc(getDb(), "cases", caseId), { ...patch, aiEnrichedAt: serverTimestamp() });
}

function toView(data: unknown, pendingSync: boolean): CaseView | null {
  const parsed = caseRecordSchema.safeParse(data);
  return parsed.success ? { ...parsed.data, pendingSync } : null;
}

/** Live list of the workspace's cases including local pending writes. */
export function watchCases(
  workspaceId: string,
  onData: (cases: CaseView[], pendingCount: number) => void,
  onError: (e: Error) => void,
  max = 200,
): () => void {
  const q = query(
    collection(getDb(), "cases"),
    where("workspaceId", "==", workspaceId),
    orderBy("clientCreatedAt", "desc"),
    limit(max),
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const cases: CaseView[] = [];
      let pending = 0;
      for (const d of snap.docs) {
        const view = toView(d.data(), d.metadata.hasPendingWrites);
        if (!view) continue;
        if (view.pendingSync) pending += 1;
        cases.push(view);
      }
      onData(cases, pending);
    },
    onError,
  );
}

export async function writeDemoCases(records: CaseRecord[]): Promise<void> {
  const database = getDb();
  for (let i = 0; i < records.length; i += 400) {
    const batch = writeBatch(database);
    for (const r of records.slice(i, i + 400)) {
      const parsed = caseRecordSchema.parse(r);
      batch.set(doc(database, "cases", parsed.caseId), { ...parsed, createdAt: serverTimestamp() });
    }
    await batch.commit();
  }
}

export async function deleteDemoCases(workspaceId: string): Promise<number> {
  const database = getDb();
  const snap = await getDocs(
    query(collection(database, "cases"), where("workspaceId", "==", workspaceId), where("isDemo", "==", true)),
  );
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(database);
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
  return snap.size;
}

export interface SitrepRecord {
  workspaceId: string;
  county: string;
  generatedBy: string;
  windowDays: number;
  casesAnalyzed: number;
  alertStatus: "NORMAL" | "WATCH" | "CRITICAL";
  aggregateInput: string;
  executiveSummary: string;
  hypotheses: string[];
  recommendations: string[];
  model: string;
  inferenceSource: "cloud";
  latencyMs: number;
}

export async function saveSitrep(report: SitrepRecord): Promise<string> {
  const ref = doc(collection(getDb(), "sitreps"));
  await setDoc(ref, { ...report, generatedAt: serverTimestamp() });
  return ref.id;
}
