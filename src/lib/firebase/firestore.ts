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
import { z } from "zod";
import { caseRecordSchema, type CaseRecord, type CaseView } from "@/lib/cases/types";
import { byteSize, recordEgress } from "@/lib/egress/ledger";
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
  const json = JSON.stringify(parsed);
  recordEgress({
    channel: "firestore",
    destination: "Firestore: cases",
    description: `De-identified case record ${parsed.caseId} (${Object.keys(parsed).length} allowlisted fields), synced when online`,
    bytes: byteSize(json),
    leftDevice: true,
    detail: json,
  });
  return { serverAck };
}

export function updateCaseEnrichment(
  caseId: string,
  patch: Pick<CaseRecord, "riskLevel" | "riskReasons" | "deidentifiedSummary" | "recommendedActions" | "inferenceSource" | "latencyMs">,
): Promise<void> {
  const json = JSON.stringify(patch);
  recordEgress({
    channel: "firestore",
    destination: "Firestore: cases",
    description: `AI review update for case ${caseId}`,
    bytes: byteSize(json),
    leftDevice: true,
    detail: json,
  });
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
  recordEgress({
    channel: "firestore",
    destination: "Firestore: cases",
    description: `${records.length} fictional demo case records`,
    bytes: byteSize(JSON.stringify(records)),
    leftDevice: true,
  });
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

const declarationSchema = z.object({ subCounties: z.array(z.string().max(64)).max(32) });

/**
 * Live list of sub-counties where the county team has declared an outbreak.
 * Field triage uses it to switch to the outbreak case definition, offline too (from the local cache).
 */
export function watchDeclarations(
  workspaceId: string,
  onData: (subCounties: string[]) => void,
  onError: (e: Error) => void,
): () => void {
  return onSnapshot(
    doc(getDb(), "declarations", workspaceId),
    (snap) => {
      const parsed = declarationSchema.safeParse(snap.data());
      onData(parsed.success ? parsed.data.subCounties : []);
    },
    onError,
  );
}

/** Not awaited by callers on the UI path: the local cache applies it immediately, offline included. */
export function saveDeclarations(workspaceId: string, uid: string, subCounties: string[]): { serverAck: Promise<void> } {
  const list = [...new Set(subCounties)].sort();
  const serverAck = setDoc(doc(getDb(), "declarations", workspaceId), {
    workspaceId,
    subCounties: list,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  recordEgress({
    channel: "firestore",
    destination: "Firestore: declarations",
    description: "Outbreak declarations by sub-county",
    bytes: byteSize(JSON.stringify(list)),
    leftDevice: true,
    detail: JSON.stringify(list),
  });
  return { serverAck };
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
  recordEgress({
    channel: "firestore",
    destination: "Firestore: sitreps",
    description: "Situation report with its aggregate input, for audit",
    bytes: byteSize(JSON.stringify(report)),
    leftDevice: true,
  });
  await setDoc(ref, { ...report, generatedAt: serverTimestamp() });
  return ref.id;
}
