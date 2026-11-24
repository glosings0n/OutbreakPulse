/**
 * Deterministic, local PII scrubber. Runs on every note before anything can leave the device.
 * It is intentionally conservative: false positives (over-redaction) are acceptable,
 * false negatives are not. On-device AI adds a second pass for names it can recognise.
 */

export type PiiKind = "PHONE" | "EMAIL" | "ID" | "LOCATION" | "DOB" | "NAME" | "ADDRESS";

export interface Redaction {
  kind: PiiKind;
  /** Length of the removed text. The text itself is never retained. */
  length: number;
}

export interface ScrubResult {
  text: string;
  redactions: Redaction[];
}

interface Rule {
  kind: PiiKind;
  pattern: RegExp;
  /** Index of the capture group to replace. 0 replaces the whole match. */
  group?: number;
}

const NAME_WORD = "[A-Z][a-z'\\u00C0-\\u017F-]+";
const FULL_NAME = `${NAME_WORD}(?:\\s+${NAME_WORD}){0,2}`;

const RULES: Rule[] = [
  { kind: "EMAIL", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // GPS coordinates such as -1.28333, 36.81667
  { kind: "LOCATION", pattern: /-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g },
  // Dates of birth introduced by a cue
  {
    kind: "DOB",
    pattern: /\b(?:born(?:\s+on)?|dob|date of birth)[:\s]+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/gi,
    group: 1,
  },
  // Identity documents introduced by a cue
  {
    kind: "ID",
    pattern: /\b(?:id|national id|passport|nin|card)\s*(?:no\.?|number|#)?[:\s]+([A-Z0-9-]{5,})/gi,
    group: 1,
  },
  // Phone numbers: 7+ digits with optional +, spaces, dots or dashes
  { kind: "PHONE", pattern: /(?:[+(]{1,2})?\d[\d\s().-]{6,}\d/g },
  // Street style addresses and plot numbers
  {
    kind: "ADDRESS",
    pattern: new RegExp(
      `\\b(?:house|plot|plot no\\.?|house no\\.?|apartment|apt|flat)\\s*#?\\s*\\d+[A-Za-z]?|\\b\\d+[A-Za-z]?\\s+${NAME_WORD}\\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Close|Drive)\\b`,
      "gi",
    ),
  },
  // Titles followed by a name
  {
    kind: "NAME",
    pattern: new RegExp(`\\b(?:Mr|Mrs|Ms|Miss|Dr|Mama|Baba|Mzee|Madam|Mme|Chief)\\.?\\s+(${FULL_NAME})`, "g"),
    group: 1,
  },
  // Cue words followed by a name, e.g. "visited Amani Kato", "patient named Juma"
  {
    kind: "NAME",
    pattern: new RegExp(
      `\\b(?:[Nn]amed|[Nn]ame is|[Cc]alled|[Pp]atient|[Vv]isited|[Ss]een|[Mm]other|[Ff]ather|[Ss]on|[Dd]aughter|[Bb]rother|[Ss]ister|[Ww]ife|[Hh]usband|[Cc]hild|[Cc]aregiver|[Nn]eighbou?r)\\s+(?:of\\s+)?(${FULL_NAME})`,
      "g",
    ),
    group: 1,
  },
];

/** Capitalised words that are clinical or geographic vocabulary, not names. */
const NOT_NAMES = new Set([
  "ORS", "AWD", "The", "He", "She", "They", "Has", "Had", "With", "And", "No", "Yes",
  "Riverside", "Market", "Hill", "North", "Bay", "Kilima", "Old", "Town", "Lakeshore", "County",
]);

function isLikelyName(candidate: string): boolean {
  const words = candidate.split(/\s+/);
  return words.some((w) => !NOT_NAMES.has(w));
}

export function scrubDeterministic(input: string): ScrubResult {
  let text = input;
  const redactions: Redaction[] = [];

  for (const rule of RULES) {
    text = text.replace(rule.pattern, (match: string, ...rest: unknown[]) => {
      const group = rule.group ?? 0;
      const target = group === 0 ? match : (rest[group - 1] as string | undefined);
      if (!target) return match;
      if (rule.kind === "PHONE" && target.replace(/\D/g, "").length < 7) return match;
      if (rule.kind === "NAME" && !isLikelyName(target)) return match;
      redactions.push({ kind: rule.kind, length: target.length });
      return match.replace(target, `[${rule.kind}]`);
    });
  }

  return { text, redactions };
}

/**
 * Applies extra PII strings detected by the on-device model.
 * Only strings of 2+ characters that literally occur in the text are replaced.
 */
export function applyPiiStrings(input: string, piiStrings: readonly string[]): ScrubResult {
  let text = input;
  const redactions: Redaction[] = [];
  const unique = [...new Set(piiStrings.map((s) => s.trim()).filter((s) => s.length >= 2))]
    // Longest first so "Amani Kato" is replaced before "Amani".
    .sort((a, b) => b.length - a.length);

  for (const pii of unique) {
    if (/^\[[A-Z]+\]$/.test(pii)) continue;
    const escaped = pii.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "g");
    text = text.replace(pattern, () => {
      redactions.push({ kind: "NAME", length: pii.length });
      return "[NAME]";
    });
  }
  return { text, redactions };
}

/** Last line of defence before persisting any free text. */
export function containsObviousPii(text: string): boolean {
  return scrubDeterministic(text).redactions.some((r) => r.kind !== "NAME");
}
