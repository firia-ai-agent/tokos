import { describe, expect, it } from "vitest";
import { hasClearedPayment, hasSignedContract, resourceGate, resourcesUnlocked } from "./resource-gate";

const NAMED = { doulaName: "Maya Chen", doulaFirstName: "Maya" };

/** The seeded Jordan: agreement sent, deposit open, nothing cleared. This is the demo. */
const jordan = { contractStatuses: ["sent"], invoiceStatuses: ["open"] };

describe("resource gate (TOK-39 E2)", () => {
  it("needs both halves, not either", () => {
    expect(resourcesUnlocked({ contractStatuses: ["signed"], invoiceStatuses: ["paid"] })).toBe(true);
    expect(resourcesUnlocked({ contractStatuses: ["signed"], invoiceStatuses: ["open"] })).toBe(false);
    expect(resourcesUnlocked({ contractStatuses: ["sent"], invoiceStatuses: ["paid"] })).toBe(false);
    expect(resourcesUnlocked({ contractStatuses: [], invoiceStatuses: [] })).toBe(false);
  });

  it("locks the seeded Jordan — sent plus open is not signed plus paid", () => {
    expect(resourcesUnlocked(jordan)).toBe(false);
    expect(resourceGate({ ...jordan, ...NAMED }).locked).toBe(true);
  });

  it("counts a complete contract as signed, because it already is", () => {
    expect(hasSignedContract(["complete"])).toBe(true);
    expect(hasSignedContract(["sent", "void"])).toBe(false);
    expect(hasSignedContract(["draft"])).toBe(false);
  });

  it("counts only a cleared invoice — an open bill is not a payment", () => {
    expect(hasClearedPayment(["paid"])).toBe(true);
    expect(hasClearedPayment(["open", "void"])).toBe(false);
  });

  it("unlocks when any one contract is signed and any one invoice cleared", () => {
    expect(
      resourcesUnlocked({
        contractStatuses: ["void", "signed"],
        invoiceStatuses: ["open", "paid"],
      }),
    ).toBe(true);
  });

  it("names the assigned doula in the locked sentence, never 'your doula'", () => {
    const gate = resourceGate({ ...jordan, ...NAMED });
    expect(gate.body).toBe("Available after your agreement with Maya Chen is signed and paid.");
    expect(gate.body).not.toMatch(/your doula/i);
  });

  it("never says 'locked' or reads a policy at the family", () => {
    const gate = resourceGate({ ...jordan, ...NAMED });
    const text = [gate.title, gate.body, gate.hint].join(" ");
    expect(text).not.toMatch(/locked|policy|permission|unauthori[sz]ed/i);
  });

  it("points an unsigned family at the agreement that is actually waiting", () => {
    const gate = resourceGate({ ...jordan, ...NAMED });
    expect(gate.next).toEqual({
      label: "Review and sign your agreement",
      href: "/portal/contract",
    });
  });

  it("does not invent a next step when there is nothing to click yet", () => {
    const gate = resourceGate({ contractStatuses: [], invoiceStatuses: [], ...NAMED });
    expect(gate.next).toBeNull();
    expect(gate.hint).toContain("Maya Chen");
  });

  it("thanks a signed family for the half they did, and sends them to the invoice", () => {
    const gate = resourceGate({
      contractStatuses: ["signed"],
      invoiceStatuses: ["open"],
      ...NAMED,
    });
    expect(gate.signed).toBe(true);
    expect(gate.paid).toBe(false);
    expect(gate.hint).toBe("Thanks for signing. The first payment opens your handouts.");
    expect(gate.next).toEqual({ label: "Open your invoice", href: "/portal/pay" });
  });

  it("says who sends the invoice when signed but nothing has been billed", () => {
    const gate = resourceGate({ contractStatuses: ["signed"], invoiceStatuses: [], ...NAMED });
    expect(gate.hint).toBe("Thanks for signing. Maya sends the first invoice here.");
    expect(gate.next).toBeNull();
  });

  it("goes quiet once the shelf is open", () => {
    const gate = resourceGate({
      contractStatuses: ["complete"],
      invoiceStatuses: ["paid"],
      ...NAMED,
    });
    expect(gate.locked).toBe(false);
    expect(gate.next).toBeNull();
    expect(gate.hint).toBe("");
  });
});
