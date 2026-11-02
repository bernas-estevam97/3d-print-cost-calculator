import { describe, expect, it } from "vitest";
import { payment } from "./payment";

const o = { paid: false, salePrice: 100, tips: 10, tipsReceived: false, advanceReceived: 0, advanceReceivedOn: false };

describe("payment", () => {
  it("counts the tip only while it is on", () => {
    expect(payment(o).due).toBe(100);
    expect(payment({ ...o, tipsReceived: true }).due).toBe(110);
  });
  it("derives unpaid / partially paid / paid from the money received", () => {
    expect(payment(o).status).toBe("unpaid");
    // an advance with the switch off is not money received
    expect(payment({ ...o, advanceReceived: 30 }).status).toBe("unpaid");
    const part = payment({ ...o, tipsReceived: true, advanceReceived: 30, advanceReceivedOn: true });
    expect(part).toMatchObject({ status: "partial", received: 30, balance: 80 });
    expect(part.share).toBeCloseTo(30 / 110);
    expect(payment(o).share).toBe(0);
    expect(payment({ ...o, advanceReceived: 100, advanceReceivedOn: true }).status).toBe("paid");
    expect(payment({ ...o, paid: true, tipsReceived: true })).toMatchObject({ status: "paid", received: 110, balance: 0, share: 1 });
  });
});
