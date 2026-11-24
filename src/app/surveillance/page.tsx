import type { Metadata } from "next";
import { GuestGate } from "@/components/GuestGate";
import { SurveillanceDashboard } from "./SurveillanceDashboard";

export const metadata: Metadata = { title: "Surveillance | OutbreakPulse" };

export default function SurveillancePage() {
  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">County surveillance</h1>
        <p className="mt-1 text-ink-2">Cluster signals from de-identified cases, and a cloud-drafted situation report.</p>
      </header>
      <GuestGate>
        <SurveillanceDashboard />
      </GuestGate>
    </div>
  );
}
