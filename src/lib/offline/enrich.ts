/**
 * Replays queued enrichment jobs through the hybrid model when the device is back online.
 * The health worker's confirmed fields are kept; AI only adds a summary and may raise the risk.
 */
import { extractFromScrubbedNote } from "@/lib/ai/tasks";
import { updateCaseEnrichment } from "@/lib/firebase/firestore";
import { sanitizeSummary } from "@/lib/triage/pipeline";
import { actionsFor, evaluateRules, mergeRisk } from "@/lib/triage/rules";
import { completeJob, listJobs, MAX_ATTEMPTS, recordAttempt } from "./queue";

let running = false;

export interface EnrichmentReport {
  processed: number;
  failed: number;
}

export async function processEnrichmentQueue(): Promise<EnrichmentReport> {
  if (running || typeof navigator === "undefined" || !navigator.onLine) return { processed: 0, failed: 0 };
  running = true;
  let processed = 0;
  let failed = 0;
  try {
    for (const job of await listJobs()) {
      if (job.attempts >= MAX_ATTEMPTS) {
        await completeJob(job.caseId);
        failed += 1;
        continue;
      }
      const res = await extractFromScrubbedNote(job.scrubbedNote);
      if (!res.ok) {
        await recordAttempt(job);
        failed += 1;
        continue;
      }
      const rules = evaluateRules(job.fields);
      const merged = mergeRisk(rules, { riskLevel: res.value.riskOpinion, reason: res.value.riskReason });
      const summary = sanitizeSummary(res.value.summary, res.value.piiStrings).text;
      try {
        await updateCaseEnrichment(job.caseId, {
          riskLevel: merged.riskLevel,
          riskReasons: merged.reasons.map((r) => r.slice(0, 200)).slice(0, 12),
          deidentifiedSummary: summary,
          recommendedActions: actionsFor(merged.riskLevel),
          inferenceSource: res.value.source,
          latencyMs: res.value.latencyMs,
        });
        await completeJob(job.caseId);
        processed += 1;
      } catch {
        await recordAttempt(job);
        failed += 1;
      }
    }
  } finally {
    running = false;
  }
  return { processed, failed };
}
