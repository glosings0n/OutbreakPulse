import type { Metadata } from "next";
import { GuestGate } from "@/components/GuestGate";
import { TriageFlow } from "./TriageFlow";

export const metadata: Metadata = { title: "Field report | OutbreakPulse" };

export default function TriagePage() {
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Field report</h1>
        <p className="mt-1 text-ink-2">Turn a field note into a de-identified case record. Works offline.</p>
      </header>
      <GuestGate>
        <TriageFlow />
      </GuestGate>
    </div>
  );
}
