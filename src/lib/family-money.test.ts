import { describe, expect, it } from "vitest";
import {
  agreementHref,
  familyMoney,
  familySignUrl,
  invoiceHref,
  isLiveContract,
  isUnsignedContract,
  type ContractLike,
  type InvoiceLike,
} from "@/lib/family-money";

const NOW = new Date("2026-09-10T12:00:00.000Z");
const CLIENT = "fam-1";

function contract(over: Partial<ContractLike> = {}): ContractLike {
  return {
    id: "c-1",
    packageLabel: "Postpartum package",
    amountCents: 120_000,
    currency: "usd",
    status: "sent",
    sentAt: new Date("2026-09-04T09:00:00.000Z"),
    signedAt: null,
    ...over,
  };
}

function invoice(over: Partial<InvoiceLike> = {}): InvoiceLike {
  return {
    id: "i-1",
    number: "INV-0004",
    status: "open",
    paymentStatus: null,
    amountCents: 120_000,
    currency: "usd",
    dueAt: new Date("2026-09-18T09:00:00.000Z"),
    ...over,
  };
}

function build(over: Partial<Parameters<typeof familyMoney>[0]> = {}) {
  return familyMoney({
    clientId: CLIENT,
    contracts: [contract()],
    invoices: [invoice()],
    allowedActions: ["send_contract"],
    now: NOW,
    ...over,
  });
}

describe("human status on the money card", () => {
  it("never renders a raw DB code as the only language", () => {
    const money = build();
    expect(money.contracts[0].status.label).toBe("Ready to sign");
    expect(money.invoices[0].status.label).toBe("Due");
    // The bar TOK-77 exists for: `sent` and `open` are not words on this card.
    const rendered = [
      money.contracts[0].status.label,
      money.invoices[0].status.label,
    ];
    expect(rendered).not.toContain("sent");
    expect(rendered).not.toContain("open");
  });

  it("borrows the ledger's Paid gate rather than trusting `invoices.status`", () => {
    // The invoice row says paid; the payment row says the card was declined. The money
    // did not land, and no surface in the product may say it did (TOK-48).
    const money = build({
      invoices: [invoice({ status: "paid", paymentStatus: "failed" })],
    });
    expect(money.invoices[0].status.label).toBe("Payment failed");
    expect(money.invoices[0].canMarkPaid).toBe(true);
  });

  it("says how late a bill is, not merely that it is due", () => {
    const money = build({
      invoices: [invoice({ dueAt: new Date("2026-09-07T09:00:00.000Z") })],
    });
    expect(money.invoices[0].status.label).toBe("Overdue by 3 days");
  });

  it("words a contract by its own status map, signed included", () => {
    const money = build({
      contracts: [contract({ status: "signed", signedAt: new Date("2026-09-06T09:00:00.000Z") })],
    });
    expect(money.contracts[0].status.label).toBe("Signed");
    expect(money.contracts[0].whenLabel).toBe("Signed Sep 6");
  });
});

describe("state-driven money verbs", () => {
  it("gives an open, unsigned family every verb that applies", () => {
    const money = build();
    expect(money.contracts[0].agreementHref).toBe(agreementHref(CLIENT, "c-1"));
    expect(money.contracts[0].canResend).toBe(true);
    expect(money.invoices[0]).toMatchObject({
      openHref: invoiceHref("INV-0004"),
      canMarkPaid: true,
      canChase: true,
      dueLabel: "Due Sep 18",
    });
  });

  it("offers nothing to chase or record once the money has cleared", () => {
    const money = build({ invoices: [invoice({ status: "paid" })] });
    expect(money.invoices[0].status.label).toBe("Paid");
    expect(money.invoices[0].canMarkPaid).toBe(false);
    expect(money.invoices[0].canChase).toBe(false);
    expect(money.invoices[0].dueLabel).toBeNull();
    // Open invoice survives: a settled bill is still a row staff may want to read.
    expect(money.invoices[0].openHref).toBe(invoiceHref("INV-0004"));
  });

  it("never chases a refunded or cancelled bill", () => {
    for (const status of ["refunded", "void", "canceled"]) {
      const money = build({ invoices: [invoice({ status })] });
      expect(money.invoices[0].canChase).toBe(false);
      expect(money.invoices[0].canMarkPaid).toBe(false);
    }
  });

  it("stops offering a resend the moment the family signs", () => {
    const money = build({
      contracts: [contract({ status: "signed", signedAt: new Date("2026-09-06T09:00:00.000Z") })],
    });
    expect(money.contracts[0].canResend).toBe(false);
    expect(money.contracts[0].agreementHref).not.toBeNull();
  });

  it("has nothing to open on a draft nobody has dispatched", () => {
    const money = build({ contracts: [contract({ status: "draft", sentAt: null })] });
    expect(money.contracts[0].agreementHref).toBeNull();
    expect(money.contracts[0].canResend).toBe(false);
  });
});

describe("Send contract", () => {
  it("is the one verb on a family with no contract and a funnel that allows it", () => {
    const money = build({ contracts: [], invoices: [], allowedActions: ["send_contract"] });
    expect(money.canSendContract).toBe(true);
    expect(money.empty).toBe(true);
  });

  it("is absent beside a live agreement, so nobody is sent the paperwork twice", () => {
    expect(build().canSendContract).toBe(false);
  });

  it("comes back once the only contract has been voided", () => {
    const money = build({ contracts: [contract({ status: "void" })] });
    expect(money.canSendContract).toBe(true);
    expect(money.contracts[0].agreementHref).toBeNull();
  });

  it("stays absent when the funnel does not allow it, whatever the card would like", () => {
    const money = build({ contracts: [], invoices: [], allowedActions: ["send_intro"] });
    expect(money.canSendContract).toBe(false);
  });
});

describe("links", () => {
  it("narrows the ledger to the one invoice rather than dumping staff on the page", () => {
    expect(invoiceHref("INV-0004")).toBe("/doula/invoices?q=INV-0004");
  });

  it("prefers the provider's document over the stub sign page", () => {
    expect(familySignUrl({ id: "c-1", documentUrl: "https://sign.example/x" }, "https://app")).toBe(
      "https://sign.example/x",
    );
    expect(familySignUrl({ id: "c-1", documentUrl: null }, "https://app")).toBe(
      "https://app/stub/sign?contractId=c-1",
    );
  });
});

describe("contract predicates", () => {
  it("reads a voided contract as over and a sent one as live", () => {
    expect(isLiveContract({ status: "void" })).toBe(false);
    expect(isLiveContract({ status: "sent" })).toBe(true);
  });

  it("trusts `signedAt` over a status that has not caught up", () => {
    expect(isUnsignedContract({ status: "sent", signedAt: new Date() })).toBe(false);
    expect(isUnsignedContract({ status: "sent", signedAt: null })).toBe(true);
    expect(isUnsignedContract({ status: "complete", signedAt: null })).toBe(false);
  });
});
