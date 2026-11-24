/**
 * Deferred AI enrichment. When a case is saved with the rules tier only (offline, no Gemini Nano),
 * its ALREADY SCRUBBED note is queued locally and enriched by the hybrid model once back online.
 * The raw note is never queued.
 */
import { createStore, del, entries, set, type UseStore } from "idb-keyval";
import type { ExtractedFields } from "@/lib/triage/extract";
import { containsObviousPii } from "@/lib/triage/redact";

export interface EnrichmentJob {
  caseId: string;
  scrubbedNote: string;
  fields: ExtractedFields;
  queuedAt: number;
  attempts: number;
}

let store: UseStore | null = null;

function getStore(): UseStore {
  if (!store) store = createStore("outbreakpulse", "enrichment-queue");
  return store;
}

export async function enqueueEnrichment(job: Omit<EnrichmentJob, "queuedAt" | "attempts">): Promise<void> {
  if (containsObviousPii(job.scrubbedNote)) {
    throw new Error("Refusing to queue a note that still contains personal data.");
  }
  await set(job.caseId, { ...job, queuedAt: Date.now(), attempts: 0 } satisfies EnrichmentJob, getStore());
}

export async function listJobs(): Promise<EnrichmentJob[]> {
  const all = await entries<string, EnrichmentJob>(getStore());
  return all.map(([, job]) => job).sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function completeJob(caseId: string): Promise<void> {
  await del(caseId, getStore());
}

export async function recordAttempt(job: EnrichmentJob): Promise<void> {
  await set(job.caseId, { ...job, attempts: job.attempts + 1 }, getStore());
}

export const MAX_ATTEMPTS = 3;
