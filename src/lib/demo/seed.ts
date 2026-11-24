/**
 * Fictional demo dataset. No real people, places or phone numbers.
 * Deterministic (seeded) so every judge sees the same story:
 * an emerging acute watery diarrhoea cluster in Riverside over the last five days,
 * a smaller signal in Market Hill, and sporadic background cases elsewhere.
 */
import type { CaseRecord, InferenceRoute } from "@/lib/cases/types";
import { newCaseId } from "@/lib/ids";
import type { ExtractedFields } from "@/lib/triage/extract";
import { buildCaseRecord, deterministicSummary } from "@/lib/triage/pipeline";
import { COUNTY, type AgeBand, type DangerSignCode, type SubCounty, type SymptomCode } from "@/lib/triage/vocabulary";

const DAY = 24 * 60 * 60 * 1000;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Profile {
  symptoms: SymptomCode[];
  dangerSigns: DangerSignCode[];
  householdContact: boolean;
  householdDeath: boolean;
}

const MILD: Profile = { symptoms: ["watery_diarrhoea"], dangerSigns: [], householdContact: false, householdDeath: false };
const MODERATE: Profile = { symptoms: ["watery_diarrhoea", "vomiting", "intense_thirst"], dangerSigns: ["sunken_eyes"], householdContact: false, householdDeath: false };
const SEVERE: Profile = { symptoms: ["watery_diarrhoea", "vomiting", "leg_cramps"], dangerSigns: ["sunken_eyes", "slow_skin_pinch", "lethargic_or_unconscious"], householdContact: true, householdDeath: false };
const LINKED: Profile = { symptoms: ["watery_diarrhoea", "vomiting"], dangerSigns: [], householdContact: true, householdDeath: false };
const FATAL_HOUSEHOLD: Profile = { symptoms: ["watery_diarrhoea", "vomiting"], dangerSigns: ["unable_to_drink"], householdContact: true, householdDeath: true };
const OTHER: Profile = { symptoms: ["fever", "abdominal_cramps"], dangerSigns: [], householdContact: false, householdDeath: false };

interface Plan {
  subCounty: SubCounty;
  daysAgo: number;
  profile: Profile;
}

function plan(rand: () => number): Plan[] {
  const out: Plan[] = [];
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

  // Background over 21 days: sporadic, mostly mild.
  const background: SubCounty[] = ["Riverside", "Market Hill", "North Bay", "Kilima", "Old Town"];
  for (let i = 0; i < 26; i++) {
    out.push({ subCounty: pick(background), daysAgo: 6 + Math.floor(rand() * 15), profile: pick([MILD, MILD, OTHER, MODERATE]) });
  }

  // Riverside cluster: last 5 days, escalating.
  const cluster: [number, Profile][] = [
    [4, MILD], [4, LINKED], [3, MODERATE], [3, LINKED], [2, SEVERE], [2, LINKED], [2, MODERATE],
    [1, SEVERE], [1, FATAL_HOUSEHOLD], [1, LINKED], [0, SEVERE], [0, MODERATE],
  ];
  for (const [daysAgo, profile] of cluster) out.push({ subCounty: "Riverside", daysAgo, profile });

  // Market Hill: a smaller, recent signal (watch level).
  for (const [daysAgo, profile] of [[3, MILD], [2, MODERATE], [1, LINKED]] as [number, Profile][]) {
    out.push({ subCounty: "Market Hill", daysAgo, profile });
  }

  // A few recent sporadic cases elsewhere.
  out.push({ subCounty: "North Bay", daysAgo: 2, profile: OTHER });
  out.push({ subCounty: "Kilima", daysAgo: 1, profile: MILD });
  return out;
}

const AGE_BANDS: AgeBand[] = ["2-4", "5-14", "15-49", "15-49", "50+"];
const ROUTES: InferenceRoute[] = ["on_device", "on_device", "cloud", "rules_only"];

/**
 * The clinical content is seeded so every workspace sees the same scenario, but case IDs are random:
 * document IDs are global in Firestore, so seeded IDs would collide across guest workspaces.
 */
export function buildDemoCases(
  workspaceId: string,
  agentUid: string,
  now: number = Date.now(),
  newId: () => string = () => newCaseId(),
): CaseRecord[] {
  const rand = mulberry32(20261130);
  return plan(rand).map((p) => {
    const fields: ExtractedFields = {
      ageBand: AGE_BANDS[Math.floor(rand() * AGE_BANDS.length)],
      sex: rand() < 0.5 ? "female" : "male",
      onsetDaysAgo: Math.floor(rand() * 3),
      symptoms: p.profile.symptoms,
      dangerSigns: p.profile.dangerSigns,
      householdContact: p.profile.householdContact,
      householdDeath: p.profile.householdDeath,
      subCounty: p.subCounty,
    };
    const route = ROUTES[Math.floor(rand() * ROUTES.length)];
    const latency = route === "on_device" ? 250 + Math.floor(rand() * 500) : route === "cloud" ? 900 + Math.floor(rand() * 900) : null;
    // Spread within the day, between 07:00 and 17:00 local time.
    const dayStart = new Date(now - p.daysAgo * DAY);
    dayStart.setHours(7, 0, 0, 0);
    const createdAt = Math.min(now - 60_000, dayStart.getTime() + Math.floor(rand() * 10 * 60 * 60 * 1000));

    return buildCaseRecord({
      caseId: newId(),
      workspaceId,
      agentUid,
      county: COUNTY,
      subCounty: p.subCounty,
      fields,
      summary: deterministicSummary(fields),
      route,
      latencyMs: latency,
      redactionCount: route === "rules_only" ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 3),
      aiRisk: null,
      now: createdAt,
      isDemo: true,
    });
  });
}
