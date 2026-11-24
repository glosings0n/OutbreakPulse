/**
 * Deterministic, local PII scrubber. Runs on every note before anything can leave the device.
 * It is intentionally conservative: false positives (over-redaction) are acceptable,
 * false negatives are not. On-device AI adds a second pass for names it can recognise.
 *
 * Three passes: pattern rules (phones, emails, IDs, coordinates, dates of birth, addresses),
 * cue rules (titles and relationship words before a name), then a capitalisation pass that removes
 * proper nouns the cues missed. The evaluation set in src/lib/eval measures what each pass catches.
 */
import { DANGER_SIGNS, SUB_COUNTIES, SYMPTOMS } from "./vocabulary";

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
  // Document numbers that mix a letter prefix and 5+ digits, e.g. KX-4471902 or A1234567
  { kind: "ID", pattern: /\b[A-Z]{1,3}-?\d{5,}[A-Z]?\b/g },
  // Phone numbers: 7+ digits with optional +, spaces, dots or dashes
  { kind: "PHONE", pattern: /(?:[+(]{1,2})?\d[\d\s().-]{5,}\d/g },
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
      `\\b(?:[Nn]amed|[Nn]ame is|[Cc]alled|[Pp]atient|[Vv]isited|[Ss]een|[Mm]other|[Ff]ather|[Ss]on|[Dd]aughter|[Bb]rother|[Ss]ister|[Ww]ife|[Hh]usband|[Cc]hild|[Cc]aregiver|[Nn]eighbou?r|[Gg]randmother|[Gg]randfather|[Gg]randma|[Aa]untie|[Aa]unt|[Uu]ncle|[Dd]ad|[Mm]um|[Nn]urse|[Tt]eacher)\\s+(?:of\\s+)?(${FULL_NAME})`,
      "g",
    ),
    group: 1,
  },
];

/**
 * Capitalised words that are not names: clinical vocabulary, demo geography, calendar words and
 * words health workers often start a sentence with. Compared in lower case.
 */
const NOT_NAMES = new Set(
  [
    "ors", "awd", "the", "he", "she", "they", "his", "her", "their", "has", "had", "with", "and", "no", "yes", "not",
    "a", "an", "at", "in", "on", "of", "for", "from", "to", "by", "after", "before", "since", "also", "very", "now",
    "lakeshore", "county", "sub-county", "district", "village", "school", "market", "clinic", "dispensary", "hospital",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "today", "yesterday", "tonight",
    "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
    "patient", "pt", "case", "child", "boy", "girl", "man", "woman", "men", "women", "baby", "infant", "toddler", "adult",
    "elderly", "old", "young", "male", "female", "mother", "father", "wife", "husband", "son", "daughter", "brother",
    "sister", "grandmother", "grandfather", "grandma", "aunt", "auntie", "uncle", "dad", "mum", "mama", "baba", "nurse",
    "teacher", "caregiver", "neighbour", "neighbor", "family", "household", "twins", "visited", "seen", "saw", "met",
    "called", "referred", "contact", "phone", "tel", "mob", "home", "house", "plot", "name", "follow-up", "followup",
    "approx", "about", "around", "mild", "moderate", "severe", "sudden", "acute", "rice", "rice-water", "watery",
    "loose", "stool", "stools", "diarrhoea", "diarrhea", "eyes", "skin", "pinch", "pulse", "lives", "works", "found",
    "started", "two", "three", "four", "five", "many", "several", "some", "one", "danger", "signs", "symptoms",
    "drowsy", "lethargic", "unconscious", "weak", "thirsty", "sunken", "vomiting", "fever", "cramps", "gps", "id",
    "cholera", "suspected", "oral", "rehydration", "solution", "risk", "high", "medium", "low", "dehydration", "signs",
    ...SUB_COUNTIES.flatMap((s) => s.split(/\s+/)),
    ...[...SYMPTOMS, ...DANGER_SIGNS].flatMap((v) => [...v.label.split(/\s+/), ...v.keywords.flatMap((k) => k.split(/\s+/))]),
  ].map((w) => w.toLowerCase()),
);

function isNameWord(w: string): boolean {
  return /^[A-Z][a-zÀ-ſ'-]+$/.test(w) && !NOT_NAMES.has(w.toLowerCase().replace(/'s$/, ""));
}

function isLikelyName(candidate: string): boolean {
  const words = candidate.split(/\s+/);
  return words.some((w) => !NOT_NAMES.has(w.toLowerCase()));
}

const WORD = /^[A-Za-zÀ-ſ]/;

/**
 * Removes proper nouns that the cue rules missed. Mid-sentence capitalised words, and words right
 * after a colon as in "Name: Esther", are treated as names unless they are known vocabulary.
 * A sentence-initial word is only treated as a name when followed by another name word,
 * or by ", <number>" as in "Kevin, 16".
 */
function capitalisationPass(input: string): ScrubResult {
  const tokens = input.match(/\[[A-Z]+\]|[A-Za-zÀ-ſ'-]+|[^A-Za-zÀ-ſ'[-]+|[[-]/g) ?? [];
  const isName = new Array<boolean>(tokens.length).fill(false);

  let sentenceStart = true;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!WORD.test(t)) {
      if (/[.!?\n]/.test(t)) sentenceStart = true;
      else if (t.includes(":")) sentenceStart = false;
      continue;
    }
    if (isNameWord(t)) {
      if (!sentenceStart) {
        isName[i] = true;
      } else {
        const next = tokens[i + 2];
        const followedByName = /^\s+$/.test(tokens[i + 1] ?? "") && next !== undefined && isNameWord(next);
        const followedByAge = /^\s*,\s*\d/.test(tokens.slice(i + 1, i + 3).join(""));
        if (followedByName || followedByAge) isName[i] = true;
      }
    }
    sentenceStart = false;
  }

  const redactions: Redaction[] = [];
  let text = "";
  for (let i = 0; i < tokens.length; i++) {
    if (!isName[i]) {
      text += tokens[i];
      continue;
    }
    // Merge consecutive name words, so "Mary Chebet" becomes one placeholder.
    let j = i;
    let length = tokens[i].length;
    while (j + 2 < tokens.length && /^\s+$/.test(tokens[j + 1]) && isName[j + 2]) {
      length += tokens[j + 1].length + tokens[j + 2].length;
      j += 2;
    }
    redactions.push({ kind: "NAME", length });
    text += "[NAME]";
    i = j;
  }
  return { text, redactions };
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

  const names = capitalisationPass(text);
  return { text: names.text, redactions: [...redactions, ...names.redactions] };
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
