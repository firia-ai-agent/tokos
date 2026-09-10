/**
 * The canonical lead-to-care lifecycle (TOK-49).
 *
 * The old six-stage funnel compressed exactly the part of the journey an agency manages
 * hardest — everything between "someone emailed us" and "we have a signed agreement" was
 * two chips, `intro` and `fit`. NOVA's real board is pre-contract almost end to end, so
 * the stages below split that stretch out and add the after-care tail the funnel never
 * had (`postpartum`, `closed`).
 *
 * Two rules survive the expansion unchanged, because they are the ones that cost money
 * when they are wrong:
 *  - `agreement_signed` is intent. Complete is fit confirmed AND payment cleared.
 *  - A stage word never reaches a family. `STAGE_LABELS` is agency vocabulary;
 *    `CLIENT_STAGE_LABELS` is the sanctioned family wording (TOK-32).
 *
 * What does change: the pipeline may now move backward. It is a dropdown, not a ratchet,
 * so a mis-click is a correction rather than a support ticket — `requiresBackwardConfirm`
 * tells the UI when to ask first.
 */

import { isPaymentCleared } from "@/lib/payment";

export const PIPELINE_STAGES = [
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
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGES)[number];

/** Staff wording. The doula pipeline is a pipeline, and `/doula/*` may say so. */
export const STAGE_LABELS: Record<PipelineStageName, string> = {
  new_lead: "New lead",
  outreach_sent: "Outreach sent",
  consult_scheduled: "Consult scheduled",
  consult_done: "Consult done",
  fit_confirmed: "Fit confirmed",
  agreement_signed: "Agreement signed",
  complete: "Complete",
  active_care: "Active care",
  postpartum: "Postpartum",
  closed: "Closed",
};

/** One line of staff help per stage — what it means to be sitting here. */
export const STAGE_HINTS: Record<PipelineStageName, string> = {
  new_lead: "Captured. Nobody has acted yet.",
  outreach_sent: "First contact is out; waiting on a reply.",
  consult_scheduled: "A consult date is on the record.",
  consult_done: "The consult happened — log what came of it.",
  fit_confirmed: "The match is made.",
  agreement_signed: "Intent only. Not complete until payment clears.",
  complete: "Fit confirmed and payment cleared.",
  active_care: "Care is running.",
  postpartum: "After the birth, postpartum support.",
  closed: "Nothing further open on this record.",
};

/**
 * Family wording for the same canonical stages (TOK-32). A family is never a "lead" and
 * never sees a stage code, so any client or public surface that names a stage reads from
 * this map; `/doula/*` keeps `STAGE_LABELS`. The DB column is unchanged.
 *
 * Portal Home shows no stage chip at all (TOK-40) — a family tracks their own next step
 * off the checklist, not their position in someone else's funnel. This map stays because
 * it is the sanctioned wording the moment a client surface does need one.
 */
export const CLIENT_STAGE_LABELS: Record<PipelineStageName, string> = {
  new_lead: "Getting started",
  outreach_sent: "Intro sent",
  consult_scheduled: "Consult scheduled",
  consult_done: "Consult complete",
  fit_confirmed: "Matched with your doula",
  agreement_signed: "Agreement signed",
  complete: "Ready for care",
  active_care: "Active care",
  postpartum: "Postpartum support",
  closed: "Care complete",
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

export function stageHint(stage: string): string {
  return STAGE_HINTS[stage as PipelineStageName] ?? "";
}

/**
 * Doula wording for the same canonical stages (TOK-49 soft fold).
 *
 * `STAGE_LABELS` is agency vocabulary and NOVA's owner should keep it — she really is
 * working a pipeline. A solo doula is not: the person who booked a consult is a family
 * from the first minute, and reading "New lead" over her own two clients was the whole
 * of Vera's Priya complaint. Only the words that carry funnel voice are overridden; the
 * rest of the lifecycle already reads as care and is shared, so the two maps cannot
 * drift apart stage by stage.
 */
export const DOULA_STAGE_LABEL_OVERRIDES: Partial<Record<PipelineStageName, string>> = {
  new_lead: "New family",
  outreach_sent: "Intro sent",
};

export const DOULA_STAGE_LABELS: Record<PipelineStageName, string> = {
  ...STAGE_LABELS,
  ...DOULA_STAGE_LABEL_OVERRIDES,
};

/** Which staff persona is reading. Mirrors `ShellPersona` without importing the shell. */
export type StaffPersona = "agency" | "doula";

/**
 * The one label function every `/doula/*` surface should call. Hardcoding either map in
 * a page is what let "Open pipeline" and "New lead" survive on a doula's screen, so the
 * pages pass their persona and this decides.
 */
export function staffStageLabel(persona: StaffPersona, stage: string): string {
  const map = persona === "doula" ? DOULA_STAGE_LABELS : STAGE_LABELS;
  return map[stage as PipelineStageName] ?? stageLabel(stage);
}

/** Persona-aware options for the board's stage filter, in lifecycle order. */
export function staffStageOptions(
  persona: StaffPersona,
): Array<{ value: PipelineStageName; label: string }> {
  return PIPELINE_STAGES.map((stage) => ({ value: stage, label: staffStageLabel(persona, stage) }));
}

/** Heading over that filter. "Stage" is board vocabulary; a doula gets the care word. */
export function staffStageFilterLabel(persona: StaffPersona): string {
  return persona === "doula" ? "Care stage" : "Stage";
}

/**
 * Stage values written before TOK-49. Kept as data rather than as branches in five
 * call sites, so the seed, a one-shot remap and any straggling row all agree.
 */
export const LEGACY_STAGE_MAP: Record<string, PipelineStageName> = {
  intro: "outreach_sent",
  // `fit` meant "a consult is in the diary" until the fit flag was set; `migrateStage`
  // splits the two, because a row that only ever reached `fit` is not a confirmed match.
  fit: "consult_scheduled",
  contract_complete: "complete",
};

/**
 * Read any stored stage as a canonical one. `fit` is the interesting case: with the fit
 * flag set it was a confirmed match, without it a booked consult, and collapsing both
 * into one stage would either invent a match or lose one.
 */
export function migrateStage(
  raw: string | null | undefined,
  opts: { fitConfirmed?: boolean } = {},
): PipelineStageName {
  const value = String(raw ?? "").trim();
  if (isStage(value)) return value;
  if (value === "fit") return opts.fitConfirmed ? "fit_confirmed" : "consult_scheduled";
  return LEGACY_STAGE_MAP[value] ?? "new_lead";
}

export type FunnelFlags = {
  fitConfirmed: boolean;
  paymentCleared: boolean;
  agreementSigned: boolean;
  /**
   * A consult date is on the record. Optional so every existing caller keeps compiling,
   * and absent means absent — `consult_scheduled` is refused rather than assumed.
   */
  consultDateSet?: boolean;
};

/**
 * The four flags, read off rows a caller already has in memory (TOK-72).
 *
 * `getFunnelFlags` reads one family at a time, which is the right shape for a family
 * record and the wrong one for a board: the kanban has to know, for forty families at
 * once, which stages a move is actually allowed to land on — otherwise the Move-to
 * dropdown offers stages the server will refuse. So the derivation moves here, pure, and
 * both the single read and the bulk read reduce through it. One rule set; the board and
 * the record cannot disagree about whether a move is legal.
 *
 * `contract`, `payment` and `invoice` are the latest ones for the family, matching what
 * `getFunnelFlags` looks at — not "any contract ever", which would call a family signed
 * off a voided draft.
 */
export function funnelFlagsFrom(input: {
  fitConfirmedAt?: Date | null;
  /** Anything truthy on `clients.consultDate`. A date is a date; the value is not read. */
  consultDate?: unknown;
  contract?: { status?: string | null; signedAt?: Date | null } | null;
  payment?: { status?: string | null } | null;
  invoice?: { status?: string | null } | null;
}): FunnelFlags {
  return {
    fitConfirmed: Boolean(input.fitConfirmedAt),
    consultDateSet: Boolean(input.consultDate),
    paymentCleared: isPaymentCleared({
      paymentStatus: input.payment?.status,
      invoiceStatus: input.invoice?.status,
    }),
    agreementSigned:
      Boolean(input.contract?.signedAt) || input.contract?.status === "signed",
  };
}

export type TransitionResult =
  | { ok: true; to: PipelineStageName; requiresConfirm: boolean }
  | { ok: false; reason: string };

function indexOf(stage: PipelineStageName) {
  return PIPELINE_STAGES.indexOf(stage);
}

export function isStage(value: string): value is PipelineStageName {
  return (PIPELINE_STAGES as readonly string[]).includes(value);
}

/** Everything still live: a closed record is nobody's follow-up. */
export function isOpenStage(stage: string): boolean {
  return stage !== "closed";
}

/** The funnel proper — captured but not yet in care. What "open lead" means. */
export const OPEN_LEAD_STAGES: readonly PipelineStageName[] = PIPELINE_STAGES.slice(
  0,
  PIPELINE_STAGES.indexOf("complete"),
);

export function isOpenLeadStage(stage: string): boolean {
  return (OPEN_LEAD_STAGES as readonly string[]).includes(stage);
}

/** Illegal: agreement_signed before the match is confirmed. */
export function canEnterAgreementSigned(from: PipelineStageName): boolean {
  return indexOf(from) >= indexOf("fit_confirmed");
}

/**
 * Complete rule: `complete` only when (a) fit confirmed AND (b) payment cleared.
 * agreement_signed is intent only — never complete by itself.
 */
export function canEnterContractComplete(flags: FunnelFlags): boolean {
  return flags.fitConfirmed && flags.paymentCleared;
}

/** A contract goes out once there is a consult to point at, not before. */
export function canSendContract(stage: PipelineStageName): boolean {
  return indexOf(stage) >= indexOf("consult_scheduled");
}

/** Backward moves are legal and always ask first. */
export function requiresBackwardConfirm(
  from: PipelineStageName,
  to: PipelineStageName,
): boolean {
  return indexOf(to) < indexOf(from);
}

export function canTransition(
  from: PipelineStageName,
  to: PipelineStageName,
  flags: FunnelFlags,
): TransitionResult {
  if (from === to) {
    return { ok: false, reason: "Already on this stage." };
  }

  // Gates below are direction-independent: a stage that lies about the record is just as
  // wrong reached backward as forward.
  if (to === "consult_scheduled" && !flags.consultDateSet) {
    return {
      ok: false,
      reason: "Add a consult date before scheduling. The stage is the date, not a guess.",
    };
  }

  if (to === "agreement_signed" && !canEnterAgreementSigned(from)) {
    return {
      ok: false,
      reason:
        "Cannot mark agreement signed before fit is confirmed. Signed is intent, not an entry shortcut.",
    };
  }

  if (to === "complete") {
    if (!canEnterContractComplete(flags)) {
      return {
        ok: false,
        reason:
          "Complete requires fit confirmed and payment cleared. A signature alone is not complete.",
      };
    }
    if (!flags.agreementSigned) {
      return {
        ok: false,
        reason: "Complete follows a signed agreement. Sign first, then clear payment.",
      };
    }
  }

  const backward = requiresBackwardConfirm(from, to);

  // Forward-only ordering. Coming back the other way is a correction, and a correction
  // that has to re-satisfy the forward rule is a correction nobody can make.
  if (!backward) {
    if (to === "complete" && from !== "agreement_signed") {
      // Pay-then-sign: a client can still sit on `fit_confirmed` when payment clears, and
      // once the agreement is also signed, complete is legal from there (TOK-22). Every
      // other jump into complete would skip the signature stage entirely.
      if (from !== "fit_confirmed") {
        return { ok: false, reason: "Complete follows a signed agreement." };
      }
    }
    if (to === "active_care" && from !== "complete") {
      return { ok: false, reason: "Active care follows a complete contract." };
    }
    if (to === "postpartum" && from !== "active_care") {
      return { ok: false, reason: "Postpartum follows active care." };
    }
  }

  return { ok: true, to, requiresConfirm: backward };
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
    const complete = canTransition(stage, "complete", flags);
    if (complete.ok) stage = "complete";
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

export type DoulaQuickAction = "send_intro" | "confirm_fit" | "send_contract" | "start_care";

/**
 * Secondary quick actions beside the stage dropdown (TOK-49). Stage changes belong to
 * the dropdown now; what is left here are the ones that do real work — send an email,
 * cut a contract — rather than only nudging a chip forward.
 */
export function allowedDoulaActions(
  stage: PipelineStageName,
  flags: FunnelFlags,
): DoulaQuickAction[] {
  const actions: DoulaQuickAction[] = [];
  if (stage === "new_lead") actions.push("send_intro");
  if (indexOf(stage) >= indexOf("consult_scheduled") && !flags.fitConfirmed) {
    actions.push("confirm_fit");
  }
  if (canSendContract(stage) && indexOf(stage) < indexOf("active_care")) {
    actions.push("send_contract");
  }
  if (stage === "complete") actions.push("start_care");
  return actions;
}
