import { describe, expect, it } from "vitest";
import {
  advanceAfterEvent,
  canEnterAgreementSigned,
  canEnterContractComplete,
  canTransition,
  PIPELINE_STAGES,
} from "./pipeline";

const unsigned = {
  fitConfirmed: false,
  paymentCleared: false,
  agreementSigned: false,
};

describe("canonical pipeline", () => {
  it("lists the locked TOK-10 stages in order", () => {
    expect(PIPELINE_STAGES).toEqual([
      "new_lead",
      "intro",
      "fit",
      "agreement_signed",
      "contract_complete",
      "active_care",
    ]);
  });

  it("allows the happy path one step at a time", () => {
    expect(canTransition("new_lead", "intro", unsigned).ok).toBe(true);
    expect(canTransition("intro", "fit", unsigned).ok).toBe(true);
    expect(
      canTransition("fit", "agreement_signed", {
        ...unsigned,
        agreementSigned: true,
      }).ok,
    ).toBe(true);
    expect(
      canTransition("agreement_signed", "contract_complete", {
        fitConfirmed: true,
        paymentCleared: true,
        agreementSigned: true,
      }).ok,
    ).toBe(true);
    expect(
      canTransition("contract_complete", "active_care", {
        fitConfirmed: true,
        paymentCleared: true,
        agreementSigned: true,
      }).ok,
    ).toBe(true);
  });
});

describe("illegal: agreement_signed before fit", () => {
  it("rejects signing from new_lead and intro", () => {
    expect(canEnterAgreementSigned("new_lead")).toBe(false);
    expect(canEnterAgreementSigned("intro")).toBe(false);
    expect(canTransition("new_lead", "agreement_signed", unsigned).ok).toBe(false);
    expect(canTransition("intro", "agreement_signed", unsigned).ok).toBe(false);
  });

  it("does not advance to signed when the lead is still before fit", () => {
    expect(
      advanceAfterEvent("new_lead", {
        fitConfirmed: false,
        paymentCleared: true,
        agreementSigned: true,
      }),
    ).toBe("new_lead");
    expect(
      advanceAfterEvent("intro", {
        fitConfirmed: true,
        paymentCleared: true,
        agreementSigned: true,
      }),
    ).toBe("intro");
  });
});

describe("complete rule", () => {
  it("treats agreement_signed as intent, not complete", () => {
    expect(
      canEnterContractComplete({
        fitConfirmed: false,
        paymentCleared: false,
        agreementSigned: true,
      }),
    ).toBe(false);
    expect(
      canTransition("agreement_signed", "contract_complete", {
        fitConfirmed: false,
        paymentCleared: false,
        agreementSigned: true,
      }).ok,
    ).toBe(false);
  });

  it("requires both fit confirmed and payment cleared", () => {
    expect(
      canEnterContractComplete({
        fitConfirmed: true,
        paymentCleared: false,
        agreementSigned: true,
      }),
    ).toBe(false);
    expect(
      canEnterContractComplete({
        fitConfirmed: false,
        paymentCleared: true,
        agreementSigned: true,
      }),
    ).toBe(false);
    expect(
      canEnterContractComplete({
        fitConfirmed: true,
        paymentCleared: true,
        agreementSigned: true,
      }),
    ).toBe(true);
  });

  it("does not complete from a signature plus payment without fit confirmation", () => {
    expect(
      advanceAfterEvent("fit", {
        fitConfirmed: false,
        paymentCleared: true,
        agreementSigned: true,
      }),
    ).toBe("agreement_signed");
  });

  it("completes only after sign + fit + payment", () => {
    expect(
      advanceAfterEvent("fit", {
        fitConfirmed: true,
        paymentCleared: true,
        agreementSigned: true,
      }),
    ).toBe("contract_complete");
  });

  it("stays at agreement_signed when payment is still due", () => {
    expect(
      advanceAfterEvent("agreement_signed", {
        fitConfirmed: true,
        paymentCleared: false,
        agreementSigned: true,
      }),
    ).toBe("agreement_signed");
  });
});

describe("skipping", () => {
  it("blocks jumping new_lead to fit", () => {
    expect(canTransition("new_lead", "fit", unsigned).ok).toBe(false);
  });

  it("blocks active_care before complete", () => {
    expect(
      canTransition("agreement_signed", "active_care", {
        fitConfirmed: true,
        paymentCleared: true,
        agreementSigned: true,
      }).ok,
    ).toBe(false);
  });
});
