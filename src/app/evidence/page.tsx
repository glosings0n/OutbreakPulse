import type { Metadata } from "next";
import { EvidenceView } from "./EvidenceView";

export const metadata: Metadata = { title: "Evidence | OutbreakPulse" };

export default function EvidencePage() {
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Evidence</h1>
        <p className="mt-1 max-w-3xl text-ink-2">
          Each tier measured on labelled, fictional field notes with planted identifiers. Run the AI tiers yourself: the
          numbers come from this browser, not from a slide. The sets are small and written by the project team, so they
          show where each tier helps and fails; they are not a clinical validation.
        </p>
      </header>
      <EvidenceView />
    </div>
  );
}
