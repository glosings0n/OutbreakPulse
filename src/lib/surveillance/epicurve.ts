/**
 * Epidemic curve: cases per day of symptom onset, split into suspected cholera and other cases.
 * Onset is the report day minus the reported days since onset; when onset is unknown the report day is used.
 * Pure, no Firebase imports.
 */
import { DAY_MS, isSuspectedCholera, startOfDay, type CasePoint } from "./aggregate";

export interface EpiPoint
  extends Pick<CasePoint, "subCounty" | "clientCreatedAt" | "ageBand" | "symptoms" | "dangerSigns" | "householdDeath" | "suspectedCholera"> {
  onsetDaysAgo: number | null;
}

export interface EpiDay {
  /** Local midnight of the onset day. */
  day: number;
  suspected: number;
  other: number;
}

export function epiCurve(
  cases: readonly EpiPoint[],
  { now, days, subCounty }: { now: number; days: number; subCounty: string | null },
): EpiDay[] {
  const today = startOfDay(now);
  const first = today - (days - 1) * DAY_MS;
  const out: EpiDay[] = Array.from({ length: days }, (_, i) => ({ day: first + i * DAY_MS, suspected: 0, other: 0 }));
  for (const c of cases) {
    if (subCounty && c.subCounty !== subCounty) continue;
    const onset = startOfDay(c.clientCreatedAt - (c.onsetDaysAgo ?? 0) * DAY_MS);
    if (onset < first || onset > today) continue;
    const bucket = out[Math.round((onset - first) / DAY_MS)];
    if (isSuspectedCholera(c)) bucket.suspected += 1;
    else bucket.other += 1;
  }
  return out;
}
