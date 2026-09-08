import { describe, expect, it } from "vitest";
import { contractStatusLabel, invoiceStatusLabel } from "./client-status";

/** Every status the app actually writes; see `src/lib/funnel.ts`. */
const CONTRACT_STATUSES = ["draft", "sent", "signed", "complete", "void"];
const INVOICE_STATUSES = ["open", "paid", "void"];

describe("client status labels (TOK-41)", () => {
  it.each(CONTRACT_STATUSES)("humanises the contract status %s", (status) => {
    const shown = contractStatusLabel(status);
    expect(shown.label).not.toBe(status);
    expect(shown.label[0]).toBe(shown.label[0]?.toUpperCase());
  });

  it.each(INVOICE_STATUSES)("humanises the invoice status %s", (status) => {
    expect(invoiceStatusLabel(status).label).not.toBe(status);
  });

  it("says what the family is meant to do", () => {
    expect(contractStatusLabel("sent").label).toBe("Ready to sign");
    expect(contractStatusLabel("signed").label).toBe("Signed");
    expect(invoiceStatusLabel("open").label).toBe("Due");
    expect(invoiceStatusLabel("paid").label).toBe("Paid");
  });

  it("only calls a status a chore when it is one", () => {
    expect(contractStatusLabel("sent").tone).toBe("coral");
    expect(contractStatusLabel("signed").tone).toBe("ink");
    expect(invoiceStatusLabel("open").tone).toBe("coral");
    expect(invoiceStatusLabel("paid").tone).toBe("ink");
  });

  it("never echoes a code it does not know", () => {
    expect(contractStatusLabel("countersigning").label).toBe("Being prepared");
    expect(invoiceStatusLabel("uncollectible").label).toBe("Due");
  });
});
