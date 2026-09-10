/**
 * The pipeline kanban's shape (TOK-72).
 *
 * `/doula/clients` answered "who slips today?" as a list, which is the right shape for a
 * queue and the wrong one for the board Maya works all day: she moves families along a
 * lifecycle, and a lifecycle read top-to-bottom is a lifecycle nobody can see. So the
 * same rows, the same filters and the same needs-attention rules are grouped into
 * columns here — pure, so the two properties that make a board honest are provable
 * without a browser:
 *
 *  1. **Nothing is hidden.** `groupLeadsByStage` never slices, and a column's count is
 *     its own `cards.length`. The reference mock truncates Active Care to two cards and
 *     writes "+12 more"; a board that lies about what is in a column is worse than a
 *     list, so the column scrolls instead and the count is the whole group.
 *  2. **Every offered move is a legal move.** `stageMoveOptions` asks `canTransition`
 *     with the family's own funnel flags, so the Move-to control cannot offer a stage
 *     `setPipelineStage` would refuse — and cannot hide one it would accept.
 *
 * Every stage in `PIPELINE_STAGES` gets a column, occupied or not: an empty column is a
 * drop target, and a board where you cannot move a family to Consult scheduled because
 * nobody is sitting there yet is not a board.
 */

import { familyCard, type MoneyTone } from "@/lib/home-density";
import { attentionInputOf, type LeadRowLike } from "@/lib/lead-board";
import { needsAttentionReasons } from "@/lib/needs-attention";
import {
  PIPELINE_STAGES,
  canTransition,
  staffStageLabel,
  stageHint,
  type FunnelFlags,
  type PipelineStageName,
  type StaffPersona,
} from "@/lib/pipeline";

/** Short enough to sit on one line beside the board title (shot 01). */
export const NEEDS_ACTION_LEGEND = "Terracotta edge = needs action today";

/**
 * A board row: everything the list already had, plus the two things a card and a move
 * need. Both are optional so a test can build a row by hand, and so `LeadBoardRow`
 * satisfies this structurally.
 */
export type BoardRowLike = LeadRowLike & {
  primaryDoulaName?: string | null;
  /**
   * The family's funnel flags. Absent is read as "nothing confirmed, nothing signed" —
   * conservative, so a hand-built row is offered fewer moves rather than illegal ones.
   */
  flags?: FunnelFlags;
};

const NOTHING_CONFIRMED: FunnelFlags = {
  fitConfirmed: false,
  paymentCleared: false,
  agreementSigned: false,
  consultDateSet: false,
};

export type StageMoveOption = {
  stage: PipelineStageName;
  label: string;
  /** Backward moves are legal and always ask first (`requiresBackwardConfirm`). */
  backward: boolean;
};

export type PipelineBoardCard = {
  id: string;
  name: string;
  href: string;
  stage: PipelineStageName;
  /** Service · EDD with gestation · source and recency, from the shared density builder. */
  facts: string[];
  money: { label: string; tone: MoneyTone } | null;
  /** True exactly when a needs-attention rule fired — this draws the terracotta edge. */
  needsAction: boolean;
  attention: string | null;
  /** Who is on her, for an agency reading somebody else's caseload. Null for a doula. */
  team: string | null;
  moves: StageMoveOption[];
};

export type PipelineBoardColumn = {
  stage: PipelineStageName;
  /** `staffStageLabel` — never a stage string written into a component. */
  label: string;
  /** Always `cards.length`. There is no "visible" count, because nothing is hidden. */
  count: number;
  /** One line for an empty column, so a quiet stage still says what it is for. */
  emptyHint: string;
  cards: PipelineBoardCard[];
};

/** The family record behind a card. */
export function familyRecordHref(clientId: string): string {
  return `/doula/clients/${clientId}`;
}

/**
 * Rows keyed by stage, in lifecycle order, with every stage present.
 *
 * The input order is preserved inside each group, so whatever `leadBoardView` sorted by
 * — follow-up due, overdue pinned on top — still holds down each column.
 */
export function groupLeadsByStage<T extends { stage: PipelineStageName }>(
  rows: readonly T[],
): Map<PipelineStageName, T[]> {
  const groups = new Map<PipelineStageName, T[]>();
  for (const stage of PIPELINE_STAGES) groups.set(stage, []);
  for (const row of rows) {
    // A stage outside the canonical set is a data accident, not a column: the rows are
    // already read through `migrateStage`, so dropping one here would lose a family.
    const group = groups.get(row.stage);
    if (group) group.push(row);
    else groups.set(row.stage, [row]);
  }
  return groups;
}

/** How many families are sitting on each stage, counting all of them. */
export function stageCounts(
  rows: readonly { stage: PipelineStageName }[],
): Record<PipelineStageName, number> {
  const counts = {} as Record<PipelineStageName, number>;
  for (const [stage, group] of groupLeadsByStage(rows)) counts[stage] = group.length;
  return counts;
}

/**
 * Where this family may go from here, worded for whoever is reading.
 *
 * Asks the transition rules rather than guessing, so a `new_lead` with no consult date
 * is not offered Consult scheduled, and `complete` is not offered before the agreement
 * is signed and the payment has cleared.
 */
export function stageMoveOptions(
  persona: StaffPersona,
  from: PipelineStageName,
  flags: FunnelFlags = NOTHING_CONFIRMED,
): StageMoveOption[] {
  const options: StageMoveOption[] = [];
  for (const stage of PIPELINE_STAGES) {
    const move = canTransition(from, stage, flags);
    if (!move.ok) continue;
    options.push({
      stage,
      label: staffStageLabel(persona, stage),
      backward: move.requiresConfirm,
    });
  }
  return options;
}

/**
 * The second line of team context on a card.
 *
 * An agency is reading a practice, so "who is on her" is a fact worth the row — and
 * "No primary doula" is the one the Unmatched tab exists for. A doula is reading her own
 * families; printing her own name forty times is chrome, so she gets nothing.
 */
export function boardTeamLine(persona: StaffPersona, primaryDoulaName?: string | null): string | null {
  if (persona !== "agency") return null;
  const name = String(primaryDoulaName ?? "").trim();
  return name ? `w/ ${name}` : "No primary doula";
}

/** One line under an empty column heading. Agency reads its funnel; a doula does not. */
export function emptyColumnHint(persona: StaffPersona, stage: PipelineStageName): string {
  return persona === "agency" ? stageHint(stage) : "Nobody at this step right now.";
}

export function pipelineBoardCard(
  row: BoardRowLike,
  opts: { persona: StaffPersona; now?: Date },
): PipelineBoardCard {
  const now = opts.now ?? new Date();
  const { client } = row;
  // The same rules the bell, Home and the tabs ask, off the same input builder — the edge
  // is terracotta exactly when this family is in the Needs attention queue.
  const reasons = needsAttentionReasons(attentionInputOf(row), now);
  const card = familyCard(
    {
      id: client.id,
      name: client.displayName,
      href: familyRecordHref(client.id),
      stageLabel: staffStageLabel(opts.persona, row.stage),
      serviceType: client.serviceType,
      edd: client.edd,
      source: client.source,
      lastContactAt: client.lastContactAt,
      outstandingCents: row.ledger?.outstandingCents,
      unsignedCents: row.ledger?.unsignedCents,
      clearedCents: row.ledger?.clearedCents,
      attention: reasons.map((reason) => reason.label).join(" · "),
    },
    now,
  );

  return {
    id: card.id,
    name: card.name,
    href: card.href,
    stage: row.stage,
    facts: card.facts,
    money: card.money,
    needsAction: card.needsAction,
    attention: card.attention,
    team: boardTeamLine(opts.persona, row.primaryDoulaName),
    moves: stageMoveOptions(opts.persona, row.stage, row.flags),
  };
}

/**
 * The board. One column per canonical stage, every card in its column, counts that are
 * the group's own length.
 */
export function pipelineBoardColumns(
  rows: readonly BoardRowLike[],
  opts: { persona: StaffPersona; now?: Date },
): PipelineBoardColumn[] {
  const now = opts.now ?? new Date();
  const groups = groupLeadsByStage(rows);
  return [...groups].map(([stage, group]) => ({
    stage,
    label: staffStageLabel(opts.persona, stage),
    count: group.length,
    emptyHint: emptyColumnHint(opts.persona, stage),
    cards: group.map((row) => pipelineBoardCard(row, { persona: opts.persona, now })),
  }));
}

/** How many families are on the board, and how many of them want working today. */
export function boardTotals(columns: readonly PipelineBoardColumn[]): {
  families: number;
  needsAction: number;
} {
  let families = 0;
  let needsAction = 0;
  for (const column of columns) {
    families += column.count;
    for (const card of column.cards) if (card.needsAction) needsAction += 1;
  }
  return { families, needsAction };
}
