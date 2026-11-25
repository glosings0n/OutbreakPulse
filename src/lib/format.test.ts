import { describe, expect, it } from "vitest";
import { formatCount, formatMs } from "./format";

describe("formatCount", () => {
  it("groups thousands with a narrow no-break space", () => {
    expect(formatCount(7)).toBe("7");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1726)).toBe("1 726");
    expect(formatCount(37080.4)).toBe("37 080");
    expect(formatCount(1234567)).toBe("1 234 567");
  });
  it("formats latency", () => {
    expect(formatMs(24040)).toBe("24 040 ms");
  });
});
