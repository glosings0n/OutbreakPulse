import { describe, expect, it } from "vitest";
import { applyPiiStrings, containsObviousPii, scrubDeterministic } from "./redact";

describe("scrubDeterministic", () => {
  it("removes phone numbers in common formats", () => {
    for (const phone of ["0712 345 678", "+254 712 345678", "0712-345-678", "(020) 555 0199"]) {
      const r = scrubDeterministic(`Call ${phone} tomorrow`);
      expect(r.text).toBe("Call [PHONE] tomorrow");
      expect(r.redactions[0]?.kind).toBe("PHONE");
    }
  });

  it("keeps short clinical numbers", () => {
    const r = scrubDeterministic("3 days of watery diarrhoea, 2 episodes of vomiting");
    expect(r.text).toBe("3 days of watery diarrhoea, 2 episodes of vomiting");
    expect(r.redactions).toHaveLength(0);
  });

  it("removes emails, coordinates, dates of birth and IDs", () => {
    const r = scrubDeterministic("Email a.b@example.org at -1.28333, 36.81667, born 12/03/1990, ID: AB12345");
    expect(r.text).not.toContain("example.org");
    expect(r.text).not.toContain("36.81667");
    expect(r.text).not.toContain("12/03/1990");
    expect(r.text).not.toContain("AB12345");
    expect(r.redactions.map((x) => x.kind).sort()).toEqual(["DOB", "EMAIL", "ID", "LOCATION"]);
  });

  it("removes names after titles and cue words", () => {
    const r = scrubDeterministic("Visited Amani Kato near the market. Mama Zawadi says her son Baraka is sick.");
    expect(r.text).not.toContain("Amani");
    expect(r.text).not.toContain("Zawadi");
    expect(r.text).not.toContain("Baraka");
    expect(r.text).toContain("[NAME]");
  });

  it("does not treat known places as names", () => {
    const r = scrubDeterministic("Visited Riverside again");
    expect(r.text).toBe("Visited Riverside again");
  });

  it("removes house and street addresses", () => {
    const r = scrubDeterministic("Lives in house no 14, near 22 Lake Road");
    expect(r.text).not.toMatch(/14|22 Lake Road/);
  });

  it("removes letter-prefixed document numbers and 7-digit numbers", () => {
    const r = scrubDeterministic("Nat ID of mother: KX-4471902, other number 2771903");
    expect(r.text).not.toMatch(/4471902|2771903/);
  });

  it("removes proper nouns without a cue word", () => {
    for (const [note, name] of [
      ["Grace Atieno 18 months girl, watery stool", "Atieno"],
      ["Kevin, 16, male student", "Kevin"],
      ["Name: Esther Nyambura", "Nyambura"],
      ["fever only. Contact Faith on the phone", "Faith"],
      ["father is Samuel Kiprono.", "Kiprono"],
    ] as const) {
      expect(scrubDeterministic(note).text, note).not.toContain(name);
    }
  });

  it("keeps capitalised vocabulary, places and calendar words", () => {
    const note = "Seen in Riverside on Sunday. Watery diarrhoea and Vomiting, Sunken eyes. Suspected Cholera.";
    expect(scrubDeterministic(note).text).toBe(note);
  });

  it("never keeps the removed text in the redaction log", () => {
    const r = scrubDeterministic("Call 0712 345 678");
    expect(JSON.stringify(r.redactions)).not.toContain("0712");
  });
});

describe("applyPiiStrings", () => {
  it("replaces longest strings first and only whole words", () => {
    const r = applyPiiStrings("Amani Kato and Amani went home. Amanita is a word.", ["Amani", "Amani Kato"]);
    expect(r.text).toBe("[NAME] and [NAME] went home. Amanita is a word.");
    expect(r.redactions).toHaveLength(2);
  });

  it("ignores placeholders and single characters", () => {
    const r = applyPiiStrings("[NAME] has A fever", ["[NAME]", "A"]);
    expect(r.text).toBe("[NAME] has A fever");
  });
});

describe("containsObviousPii", () => {
  it("detects phones and emails", () => {
    expect(containsObviousPii("call 0712 345 678")).toBe(true);
    expect(containsObviousPii("watery diarrhoea for 2 days")).toBe(false);
  });
});
