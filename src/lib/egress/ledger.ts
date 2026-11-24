/**
 * Device egress ledger: a visible record of every piece of content this app sends off the device,
 * and of every AI call that stayed on it. Kept in memory for the current session only.
 *
 * Entries never contain a raw note. `detail` is only set for content that is already de-identified
 * or aggregated (the exact text sent to the cloud), so the health worker can audit it.
 * Firebase SDK control traffic (sign-in, App Check tokens, configuration fetches, sync acknowledgements)
 * carries no case content and is not listed.
 */

export type EgressChannel = "ai" | "firestore";

export interface EgressEntry {
  id: number;
  at: number;
  channel: EgressChannel;
  /** Where the content went, for example "Gemini in the cloud" or "Firestore: cases". */
  destination: string;
  /** What was sent, in plain words. */
  description: string;
  /** UTF-8 size of the content that left the device; 0 when it stayed on the device. */
  bytes: number;
  leftDevice: boolean;
  /** The exact de-identified or aggregate content sent, for audit. Never a raw note. */
  detail?: string;
}

const MAX_ENTRIES = 200;
let entries: EgressEntry[] = [];
let nextId = 1;
const listeners = new Set<(list: readonly EgressEntry[]) => void>();

export function byteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function recordEgress(entry: Omit<EgressEntry, "id" | "at">): void {
  entries = [{ ...entry, id: nextId++, at: Date.now() }, ...entries].slice(0, MAX_ENTRIES);
  for (const l of listeners) l(entries);
}

export function getEgress(): readonly EgressEntry[] {
  return entries;
}

export function subscribeEgress(listener: (list: readonly EgressEntry[]) => void): () => void {
  listeners.add(listener);
  listener(entries);
  return () => {
    listeners.delete(listener);
  };
}

export interface EgressTotals {
  bytesOut: number;
  requestsOut: number;
  onDeviceCalls: number;
}

export function egressTotals(list: readonly EgressEntry[]): EgressTotals {
  return list.reduce<EgressTotals>(
    (t, e) => ({
      bytesOut: t.bytesOut + (e.leftDevice ? e.bytes : 0),
      requestsOut: t.requestsOut + (e.leftDevice ? 1 : 0),
      onDeviceCalls: t.onDeviceCalls + (e.leftDevice ? 0 : 1),
    }),
    { bytesOut: 0, requestsOut: 0, onDeviceCalls: 0 },
  );
}

/** Test helper. */
export function clearEgress(): void {
  entries = [];
  for (const l of listeners) l(entries);
}
