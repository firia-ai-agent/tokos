import { describe, expect, it } from "vitest";
import {
  advanceAfterEvent,
  allowedDoulaActions,
  canEnterAgreementSigned,
  canEnterContractComplete,
  canTransition,
  clientStageLabel,
  CLIENT_STAGE_LABELS,
  isOpenLeadStage,
  isOpenStage,
  LEGACY_STAGE_MAP,
  migrateStage,
  PIPELINE_STAGES,
  plannedHops,
  requiresBackwardConfirm,
  stageLabel,
  STAGE_HINTS,
  STAGE_LABELS,
} from "./pipeline";

const unsigned = {
  fitConfirmed: false,
  paymentCleared: false,
  agreementSigned: false,
};

const booked = { ...unsigned, consultDateSet: true };

const closable = {
  fitConfirmed: true,
  paymentCleared: true,
  agreementSigned: true,
  consultDateSet: true,
};

describe("canonical pipeline", () => {
  it("lists the full TOK-49 lead-to-care lifecycle in order", () => {
    expect(PIPELINE_STAGES).toEqual([
      "new_lead",
      "outreach_sent",
      "consult_scheduled",
      "consult_done",
      "fit_confirmed",
      "agreement_signed",
      "complete",
      "active_care",
      "postpartum",
      "closed",
    ]);
  });

  it("allows the happy path one step at a time", () => {
    expect(canTransition("new_lead", "outreach_sent", unsigned).ok).toBe(true);
    expect(canTransition("outreach_sent", "consult_scheduled", booked).ok).toBe(true);
    expect(canTransition("consult_scheduled", "consult_done", booked).ok).toBe(true);
    expect(canTransition("consult_done", "fit_confirmed", booked).ok).toBe(true);
    expect(
      canTransition("fit_confirmed", "agreement_signed", {
        ...booked,
        agreementSigned: true,
      }).ok,
    ).toBe(true);
    expect(canTransition("agreement_signed", "complete", closable).ok).toBe(true);
    expect(canTransition("complete", "active_care", closable).ok).toBe(true);
    expect(canTransition("active_care", "postpartum", closable).ok).toBe(true);
    expect(canTransition("postpartum", "closed", closable).ok).toBe(true);
  });

  it("never asks to confirm a forward move", () => {
    expect(canTransition("new_lead", "outreach_sent", unsigned)).toEqual({
      ok: true,
      to: "outreach_sent",
      requiresConfirm: false,
    });
  });

  it("refuses to move to the stage it is already on", () => {
    expect(canTransition("new_lead", "new_lead", unsigned).ok).toBe(false);
  });

  it("can close a lead from anywhere — most leads never sign", () => {
    expect(canTransition("new_lead", "closed", unsigned).ok).toBe(true);
    expect(canTransition("consult_done", "closed", booked).ok).toBe(true);
  });
});

describe("consult_scheduled requires a consult date", () => {
  it("refuses the stage when no date is on the record", () => {
    const move = canTransition("outreach_sent", "consult_scheduled", unsigned);
    expect(move.ok).toBe(false);
    expect(move.ok === false && move.reason).toMatch(/consult date/i);
  });

  it("allows it once the date is set", () => {
    expect(canTransition("outreach_sent", "consult_scheduled", booked).ok).toBe(true);
  });

  it("holds the gate on the way back too", () => {
    expect(canTransition("consult_done", "consult_scheduled", unsigned).ok).toBe(false);
    expect(canTransition("consult_done", "consult_scheduled", booked).ok).toBe(true);
  });
});

describe("backward moves are allowed, with confirmation", () => {
  it("flags every backward hop and no forward one", () => {
    expect(requiresBackwardConfirm("fit_confirmed", "consult_done")).toBe(true);
    expect(requiresBackwardConfirm("consult_done", "fit_confirmed")).toBe(false);
  });

  it("returns ok with requiresConfirm rather than refusing outright", () => {
    const move = canTransition("agreement_signed", "consult_done", closable);
    expect(move).toEqual({ ok: true, to: "consult_done", requiresConfirm: true });
  });

  it("lets a completed record be walked back — a mis-click is a correction", () => {
    const move = canTransition("complete", "fit_confirmed", closable);
    expect(move.ok).toBe(true);
    expect(move.ok === true && move.requiresConfirm).toBe(true);
  });

  it("does not re-apply forward ordering to a backward move", () => {
    // postpartum → active_care is backward; the "postpartum follows active care" rule
    // must not block undoing it.
    expect(canTransition("postpartum", "active_care", closable).ok).toBe(true);
  });
});

describe("illegal: agreement_signed before fit is confirmed", () => {
  it("rejects signing from every stage before fit_confirmed", () => {
    expect(canEnterAgreementSigned("new_lead")).toBe(false);
    expect(canEnterAgreementSigned("outreach_sent")).toBe(false);
    expect(canEnterAgreementSigned("consult_scheduled")).toBe(false);
    expect(canEnterAgreementSigned("consult_done")).toBe(false);
    expect(canEnterAgreementSigned("fit_confirmed")).toBe(true);
    expect(canTransition("new_lead", "agreement_signed", unsigned).ok).toBe(false);
    expect(canTransition("consult_done", "agreement_signed", booked).ok).toBe(false);
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
      advanceAfterEvent("consult_done", {
        fitConfirmed: true,
        paymentCleared: true,
        agreementSigned: true,
      }),
    ).toBe("consult_done");
  });
});

describe("complete rule — signed is not complete", () => {
  it("treats agreement_signed as intent, not complete", () => {
    expect(
      canEnterContractComplete({
        fitConfirmed: false,
        paymentCleared: false,
        agreementSigned: true,
      }),
    ).toBe(false);
    expect(
      canTransition("agreement_signed", "complete", {
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
    expect(canEnterContractComplete(closable)).toBe(true);
  });

  it("does not complete from a signature plus payment without fit confirmation", () => {
    expect(
      advanceAfterEvent("fit_confirmed", {
        fitConfirmed: false,
        paymentCleared: true,
        agreementSigned: true,
      }),
    ).toBe("agreement_signed");
  });

  it("completes only after sign + fit + payment", () => {
    expect(advanceAfterEvent("fit_confirmed", closable)).toBe("complete");
  });

  it("reaches complete from fit_confirmed when payment cleared before sign (TOK-22)", () => {
    expect(advanceAfterEvent("fit_confirmed", closable)).toBe("complete");
    expect(canTransition("fit_confirmed", "complete", closable).ok).toBe(true);
    expect(plannedHops("fit_confirmed", "complete")).toEqual(["agreement_signed", "complete"]);
    let stage: (typeof PIPELINE_STAGES)[number] = "fit_confirmed";
    for (const hop of plannedHops("fit_confirmed", "complete")) {
      expect(canTransition(stage, hop, closable).ok).toBe(true);
      stage = hop;
    }
    expect(stage).toBe("complete");
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

describe("forward ordering the dropdown still enforces", () => {
  it("blocks active_care before complete", () => {
    expect(canTransition("agreement_signed", "active_care", closable).ok).toBe(false);
    expect(canTransition("complete", "active_care", closable).ok).toBe(true);
  });

  it("blocks postpartum before active care", () => {
    expect(canTransition("complete", "postpartum", closable).ok).toBe(false);
  });
});

describe("legacy stage migration", () => {
  it("maps every pre-TOK-49 value", () => {
    expect(migrateStage("intro")).toBe("outreach_sent");
    expect(migrateStage("contract_complete")).toBe("complete");
    expect(Object.keys(LEGACY_STAGE_MAP).sort()).toEqual(["contract_complete", "fit", "intro"]);
  });

  it("splits `fit` on the fit flag rather than inventing or losing a match", () => {
    expect(migrateStage("fit", { fitConfirmed: true })).toBe("fit_confirmed");
    expect(migrateStage("fit", { fitConfirmed: false })).toBe("consult_scheduled");
    expect(migrateStage("fit")).toBe("consult_scheduled");
  });

  it("leaves canonical values alone and is idempotent", () => {
    for (const stage of PIPELINE_STAGES) {
      expect(migrateStage(stage)).toBe(stage);
      expect(migrateStage(migrateStage(stage))).toBe(stage);
    }
  });

  it("reads junk as the first stage rather than crashing a board", () => {
    expect(migrateStage(null)).toBe("new_lead");
    expect(migrateStage("")).toBe("new_lead");
    expect(migrateStage("who_knows")).toBe("new_lead");
  });
});

describe("open-stage helpers", () => {
  it("treats everything but closed as open", () => {
    expect(isOpenStage("active_care")).toBe(true);
    expect(isOpenStage("closed")).toBe(false);
  });

  it("counts the funnel proper as the open-lead range", () => {
    expect(isOpenLeadStage("new_lead")).toBe(true);
    expect(isOpenLeadStage("agreement_signed")).toBe(true);
    expect(isOpenLeadStage("complete")).toBe(false);
    expect(isOpenLeadStage("active_care")).toBe(false);
  });
});

describe("quick actions beside the dropdown", () => {
  it("offers the intro only on a brand new lead", () => {
    expect(allowedDoulaActions("new_lead", unsigned)).toEqual(["send_intro"]);
  });

  it("offers confirm fit and send contract once a consult exists", () => {
    expect(allowedDoulaActions("consult_done", booked)).toEqual(["confirm_fit", "send_contract"]);
  });

  it("drops confirm fit once the flag is set", () => {
    expect(allowedDoulaActions("fit_confirmed", { ...booked, fitConfirmed: true })).toEqual([
      "send_contract",
    ]);
  });

  it("offers start care only from complete", () => {
    expect(allowedDoulaActions("complete", closable)).toContain("start_care");
    expect(allowedDoulaActions("active_care", closable)).toEqual([]);
  });
});

describe("stage labels", () => {
  it("keeps the staff wording, pipeline vocabulary and all", () => {
    expect(STAGE_LABELS.new_lead).toBe("New lead");
    expect(stageLabel("new_lead")).toBe("New lead");
    expect(STAGE_LABELS.complete).toBe("Complete");
  });

  it("labels and hints every canonical stage", () => {
    for (const stage of PIPELINE_STAGES) {
      expect(STAGE_LABELS[stage]?.trim()).toBeTruthy();
      expect(STAGE_HINTS[stage]?.trim()).toBeTruthy();
      expect(CLIENT_STAGE_LABELS[stage]?.trim()).toBeTruthy();
      expect(clientStageLabel(stage)).toBe(CLIENT_STAGE_LABELS[stage]);
    }
    expect(Object.keys(CLIENT_STAGE_LABELS).sort()).toEqual([...PIPELINE_STAGES].sort());
    expect(Object.keys(STAGE_LABELS).sort()).toEqual([...PIPELINE_STAGES].sort());
  });

  it("never shows a family CRM language or a raw stage code (TOK-32)", () => {
    for (const stage of PIPELINE_STAGES) {
      const label = clientStageLabel(stage);
      expect(label.toLowerCase()).not.toContain("lead");
      expect(label.toLowerCase()).not.toContain("pipeline");
      expect(label.toLowerCase()).not.toContain("outreach");
      expect(label).not.toContain("_");
    }
    expect(clientStageLabel("new_lead")).toBe("Getting started");
  });

  it("falls back to a family label rather than echoing an unknown code", () => {
    expect(clientStageLabel("some_new_stage")).toBe("Getting started");
    // Staff keep the raw value, because a code they can grep is the useful answer.
    expect(stageLabel("some_new_stage")).toBe("some_new_stage");
  });
});
