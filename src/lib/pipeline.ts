export const PIPELINE_STAGES = [
  "new_lead",
  "intro",
  "fit",
  "agreement_signed",
  "contract_complete",
  "active_care",
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGES)[number];

/** Staff wording. The doula pipeline is a pipeline, and `/doula/*` may say so. */
export const STAGE_LABELS: Record<PipelineStageName, string> = {
  new_lead: "New lead",
  intro: "Intro",
  fit: "Fit",
  agreement_signed: "Agreement signed",
  contract_complete: "Contract complete",
  active_care: "Active care",
};

/**
 * Family wording for the same canonical stages (TOK-32). A family is never a "lead" and
 * never sees a stage code: the portal and every public page read from this map, while
 * `/doula/*` keeps `STAGE_LABELS`. The DB column is unchanged — this is a display map.
 */
export const CLIENT_STAGE_LABELS: Record<PipelineStageName, string> = {
  new_lead: "Getting started",
  intro: "Intro sent",
  fit: "Fit scheduled",
  agreement_signed: "Agreement signed",
  contract_complete: "Ready for care",
  active_care: "Active care",
};

/** Staff label for a stage string, falling back to the raw value staff can debug. */
export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as PipelineStageName] ?? stage;
}

/**
 * Family label for a stage string. An unknown stage falls back to the friendliest
 * label rather than echoing a code — a family should never read `new_lead`.
 */
export function clientStageLabel(stage: string): string {
  return CLIENT_STAGE_LABELS[stage as PipelineStageName] ?? CLIENT_STAGE_LABELS.new_lead;
}

export type FunnelFlags = {
  fitConfirmed: boolean;
  paymentCleared: boolean;
  agreementSigned: boolean;
};

export type TransitionResult =
  | { ok: true; to: PipelineStageName }
  | { ok: false; reason: string };

function indexOf(stage: PipelineStageName) {
  return PIPELINE_STAGES.indexOf(stage);
}

export function isStage(value: string): value is PipelineStageName {
  return (PIPELINE_STAGES as readonly string[]).includes(value);
}

/** Illegal: agreement_signed before the client has entered fit. */
export function canEnterAgreementSigned(from: PipelineStageName): boolean {
  return indexOf(from) >= indexOf("fit");
}

/**
 * Complete rule: contract_complete only when (a) fit confirmed AND (b) payment cleared.
 * agreement_signed is intent only — never complete by itself.
 */
export function canEnterContractComplete(flags: FunnelFlags): boolean {
  return flags.fitConfirmed && flags.paymentCleared;
}

export function canTransition(
  from: PipelineStageName,
  to: PipelineStageName,
  flags: FunnelFlags,
): TransitionResult {
  if (from === to) {
    return { ok: false, reason: "Already on this stage." };
  }

  if (to === "agreement_signed" && !canEnterAgreementSigned(from)) {
    return {
      ok: false,
      reason: "Cannot mark agreement signed before fit. Signed is intent, not an entry shortcut.",
    };
  }

  if (to === "contract_complete") {
    if (!canEnterContractComplete(flags)) {
      return {
        ok: false,
        reason:
          "contract_complete requires fit confirmed and payment cleared. A signature alone is not complete.",
      };
    }
    if (indexOf(from) < indexOf("agreement_signed") && !flags.agreementSigned) {
      return {
        ok: false,
        reason: "Complete follows a signed agreement. Sign first, then clear payment.",
      };
    }
  }

  const fromIdx = indexOf(from);
  const toIdx = indexOf(to);
  if (toIdx < fromIdx) {
    return { ok: false, reason: "Pipeline does not move backward." };
  }

  if (to === "intro" && from !== "new_lead") {
    return { ok: false, reason: "Intro follows new_lead only." };
  }
  if (to === "fit" && from !== "intro" && from !== "new_lead") {
    return { ok: false, reason: "Fit follows intro." };
  }
  if (to === "fit" && from === "new_lead") {
    return { ok: false, reason: "Share intro before starting fit." };
  }
  if (to === "agreement_signed" && from !== "fit") {
    return { ok: false, reason: "Agreement signed follows fit only." };
  }
  if (to === "contract_complete" && from !== "agreement_signed") {
    // Pay-then-sign: client can still be on `fit` after payment clears; once
    // the agreement is also signed, complete is legal (TOK-22).
    if (!(from === "fit" && flags.agreementSigned && canEnterContractComplete(flags))) {
      return { ok: false, reason: "Complete follows agreement_signed only." };
    }
  }
  if (to === "active_care" && from !== "contract_complete") {
    return { ok: false, reason: "Active care follows a complete contract." };
  }

  return { ok: true, to };
}

/**
 * After a domain event, advance as far as the complete rule allows.
 * Never skips fit. Never treats a signature as complete.
 */
export function advanceAfterEvent(
  current: PipelineStageName,
  flags: FunnelFlags,
): PipelineStageName {
  let stage = current;

  if (flags.agreementSigned && canEnterAgreementSigned(stage)) {
    const signed = canTransition(stage, "agreement_signed", flags);
    if (signed.ok) stage = "agreement_signed";
  }

  if (canEnterContractComplete(flags) && flags.agreementSigned) {
    const complete = canTransition(stage, "contract_complete", flags);
    if (complete.ok) stage = "contract_complete";
  }

  return stage;
}

/** Canonical hops from `from` to `to` so maybeAdvance can record each stage. */
export function plannedHops(from: PipelineStageName, to: PipelineStageName): PipelineStageName[] {
  const fromIdx = indexOf(from);
  const toIdx = indexOf(to);
  if (toIdx <= fromIdx) return [];
  return PIPELINE_STAGES.slice(fromIdx + 1, toIdx + 1);
}

export function allowedDoulaActions(
  stage: PipelineStageName,
  flags: FunnelFlags,
): Array<"send_intro" | "start_fit" | "confirm_fit" | "send_contract" | "start_care"> {
  const actions: Array<
    "send_intro" | "start_fit" | "confirm_fit" | "send_contract" | "start_care"
  > = [];
  if (stage === "new_lead") actions.push("send_intro");
  if (stage === "intro") actions.push("start_fit");
  if (indexOf(stage) >= indexOf("fit") && !flags.fitConfirmed) {
    actions.push("confirm_fit");
  }
  if (indexOf(stage) >= indexOf("fit") && stage !== "active_care") {
    actions.push("send_contract");
  }
  if (stage === "contract_complete") actions.push("start_care");
  return actions;
}
