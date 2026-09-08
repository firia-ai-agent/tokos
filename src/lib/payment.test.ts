import { describe, expect, it } from "vitest";
import {
  checkoutBindingError,
  isPaymentCleared,
  paymentOutcomeStatuses,
} from "./payment";

describe("stripe return session binding (TOK-21)", () => {
  const invoice = {
    id: "77777777-7777-4777-8777-777777777771",
    organizationId: "11111111-1111-4111-8111-111111111111",
    amountCents: 120000,
    currency: "usd",
  };
  const paidSession = {
    paid: true,
    metadata: { invoice_id: invoice.id, organization_id: invoice.organizationId },
    amountTotalCents: invoice.amountCents,
    currency: "usd",
  };

  it("accepts a paid session whose metadata names this invoice", () => {
    expect(checkoutBindingError(paidSession, invoice)).toBeNull();
    expect(checkoutBindingError({ ...paidSession, currency: "USD" }, invoice)).toBeNull();
  });

  it("rejects a session that settles a different invoice", () => {
    const other = { ...paidSession.metadata, invoice_id: "77777777-7777-4777-8777-777777777772" };
    expect(checkoutBindingError({ ...paidSession, metadata: other }, invoice)).toBe("mismatch");
  });

  it("rejects a session from another organization", () => {
    const crossOrg = {
      ...paidSession.metadata,
      organization_id: "11111111-1111-4111-8111-111111111112",
    };
    expect(checkoutBindingError({ ...paidSession, metadata: crossOrg }, invoice)).toBe("mismatch");
  });

  it("rejects a session with no metadata binding at all", () => {
    expect(checkoutBindingError({ ...paidSession, metadata: {} }, invoice)).toBe("mismatch");
    expect(checkoutBindingError({ ...paidSession, metadata: null }, invoice)).toBe("mismatch");
    expect(checkoutBindingError({ paid: true }, invoice)).toBe("mismatch");
  });

  it("rejects a session paid for the wrong amount or currency", () => {
    expect(checkoutBindingError({ ...paidSession, amountTotalCents: 100 }, invoice)).toBe(
      "mismatch",
    );
    expect(checkoutBindingError({ ...paidSession, currency: "eur" }, invoice)).toBe("mismatch");
  });

  it("reports unpaid only for a correctly bound but unpaid session", () => {
    expect(checkoutBindingError({ ...paidSession, paid: false }, invoice)).toBe("unpaid");
  });

  it("checks binding before payment, so a stray unpaid session never reads as this invoice", () => {
    const strayUnpaid = { ...paidSession, paid: false, metadata: {} };
    expect(checkoutBindingError(strayUnpaid, invoice)).toBe("mismatch");
  });
});

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
