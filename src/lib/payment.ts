// Payment state of an order, kept apart from its production status (an order can be done
// but unpaid, or still printing but paid). Pure: used by the browser and the server.

export type PaymentStatus = "unpaid" | "partial" | "paid";

type Payable = { paid: boolean; salePrice: number; tips: number; tipsReceived: boolean; advanceReceived: number; advanceReceivedOn: boolean };

/** The tip counts only while its switch is on; the amount is kept when it is switched off. */
export const tipOf = (o: { tips: number; tipsReceived: boolean }) => (o.tipsReceived ? o.tips : 0);

export function payment(o: Payable) {
  const tip = tipOf(o);
  const due = o.salePrice + tip;
  const advance = o.advanceReceivedOn ? o.advanceReceived : 0;
  const received = o.paid ? due : Math.min(advance, due);
  const status: PaymentStatus = o.paid || (due > 0 && received >= due - 0.005) ? "paid" : received > 0 ? "partial" : "unpaid";
  // share of the order already paid: analytics count this part of revenue and profit
  const share = due > 0 ? received / due : status === "paid" ? 1 : 0;
  return { price: o.salePrice, tip, due, advance, received, balance: Math.max(0, due - received), status, share };
}

export const PAYMENT_LABELS: Record<PaymentStatus, string> = { unpaid: "Unpaid", partial: "Partially paid", paid: "Paid" };
