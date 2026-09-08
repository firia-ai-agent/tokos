import { describe, expect, it } from "vitest";
import {
  isPaymentCleared,
  paymentOutcomeStatuses,
} from "./payment";

describe("payment status honesty (TOK-17)", () => {
  it("treats cleared + paid as payment cleared", () => {
    expect(isPaymentCleared({ paymentStatus: "cleared", invoiceStatus: "paid" })).toBe(true);
  });

  it("does not treat failed or canceled stub pay as cleared", () => {
    expect(isPaymentCleared({ paymentStatus: "failed", invoiceStatus: "open" })).toBe(false);
    expect(isPaymentCleared({ paymentStatus: "canceled", invoiceStatus: "open" })).toBe(false);
    expect(paymentOutcomeStatuses("failed").paymentCleared).toBe(false);
    expect(paymentOutcomeStatuses("canceled").invoiceStatus).toBe("open");
    expect(paymentOutcomeStatuses("failed").invoiceStatus).not.toBe("paid");
  });

  it("never reports cleared when refunded or voided", () => {
    expect(isPaymentCleared({ paymentStatus: "refunded", invoiceStatus: "refunded" })).toBe(false);
    expect(isPaymentCleared({ paymentStatus: "voided", invoiceStatus: "voided" })).toBe(false);
    expect(isPaymentCleared({ paymentStatus: "refunded", invoiceStatus: "paid" })).toBe(false);
    expect(paymentOutcomeStatuses("refunded").paymentCleared).toBe(false);
    expect(paymentOutcomeStatuses("voided").paymentCleared).toBe(false);
  });

  it("keeps due/open invoices uncleared", () => {
    expect(isPaymentCleared({ paymentStatus: "due", invoiceStatus: "open" })).toBe(false);
    expect(isPaymentCleared({ paymentStatus: "due" })).toBe(false);
  });
});
