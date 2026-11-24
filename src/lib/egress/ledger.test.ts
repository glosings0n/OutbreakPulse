import { beforeEach, describe, expect, it } from "vitest";
import { byteSize, clearEgress, egressTotals, getEgress, recordEgress, subscribeEgress } from "./ledger";

describe("egress ledger", () => {
  beforeEach(() => clearEgress());

  it("records newest first and notifies subscribers", () => {
    const seen: number[] = [];
    const stop = subscribeEgress((list) => seen.push(list.length));
    recordEgress({ channel: "ai", destination: "Gemini Nano on this device", description: "a", bytes: 0, leftDevice: false });
    recordEgress({ channel: "firestore", destination: "Firestore: cases", description: "b", bytes: 120, leftDevice: true });
    stop();
    expect(getEgress().map((e) => e.description)).toEqual(["b", "a"]);
    expect(seen).toEqual([0, 1, 2]);
  });

  it("only counts bytes that left the device", () => {
    recordEgress({ channel: "ai", destination: "Gemini Nano on this device", description: "raw", bytes: 999, leftDevice: false });
    recordEgress({ channel: "ai", destination: "cloud", description: "scrubbed", bytes: 300, leftDevice: true });
    expect(egressTotals(getEgress())).toEqual({ bytesOut: 300, requestsOut: 1, onDeviceCalls: 1 });
  });

  it("measures UTF-8 bytes", () => {
    expect(byteSize("abc")).toBe(3);
    expect(byteSize("é")).toBe(2);
  });
});
