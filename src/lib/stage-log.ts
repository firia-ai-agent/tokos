/**
 * The stage log, as something worth reading (TOK-77).
 *
 * What this replaces printed six rows of `Sep 4 · Fit confirmed → Agreement signed` and
 * called it an audit trail. It was neither: it never said *who* moved the family or
 * *why*, and half the rows were `reason: "seed"` — demo furniture wearing the same
 * typography as a real move. A log that cannot be trusted to be about the practice is a
 * log nobody opens, which is how six loud rows end up costing more density than the
 * stepper above them earns.
 *
 * Two rules, and they are the whole module:
 *
 *  - **A visible row says actor · reason · when.** If we cannot name at least the reason,
 *    the row is not primary chrome.
 *  - **Seed and empty reasons are noise.** They are counted, never printed as facts.
 *
 * Everything here is pure so the wording is testable without a database, and so the
 * one-liner above the fold and the collapsed history cannot disagree about which move was
 * the last real one.
 */

import { differenceInCalendarDays, format, isSameDay, subDays } from "date-fns";
import { migrateStage, staffStageLabel, type StaffPersona } from "@/lib/pipeline";

/** One `pipeline_events` row, structurally, plus the actor name the query joined on. */
export type StageEventLike = {
  id: string;
  fromStage: string | null;
  toStage: string;
  reason: string | null;
  at: Date;
  actorName?: string | null;
};

/**
 * Why a move happened, in words a person says out loud.
 *
 * The keys are every `reason` the product writes — `writeStage` callers in
 * `@/lib/funnel`, the CSV importer and the public booking flow. A code that is not here
 * is not invented into a sentence: `humanStageReason` returns null and the row falls back
 * to naming the transition, which is at least true.
 */
export const STAGE_REASONS: Record<string, string> = {
  outreach_sent: "Intro sent",
  book_consult_outreach: "Booked a consult online",
  public_book_consult: "Booked a consult online",
  consult_booked: "Consult booked",
  fit_confirmed: "Fit confirmed",
  agreement_signed: "Agreement signed",
  payment_cleared: "Payment cleared",
  payment_failed: "Payment failed",
  payment_canceled: "Payment cancelled",
  care_started: "Care started",
  csv_import: "Imported from a CSV",
  stage_set: "Moved by hand",
  stage_set_backward: "Moved back by hand",
};

/**
 * Reasons that describe how the demo database was built, not how this practice works.
 * They stay in the DB — rewriting history to look better is worse than a quiet row — but
 * they never wear the same type as a real move.
 */
const NOISE_REASONS = new Set(["seed", "backfill", "migration"]);

export function isNoiseReason(reason: string | null | undefined): boolean {
  const value = String(reason ?? "").trim();
  return value === "" || NOISE_REASONS.has(value);
}

/** The human phrase for a reason code, or null when there is nothing honest to say. */
export function humanStageReason(reason: string | null | undefined): string | null {
  const value = String(reason ?? "").trim();
  if (isNoiseReason(value)) return null;
  return STAGE_REASONS[value] ?? null;
}

/**
 * `Today` / `Yesterday` / `Tue` / `Mar 4` — the same ladder the inbox stamp climbs
 * (TOK-56), because "when did this happen" should read identically wherever it is asked.
 * The unambiguous stamp rides along in `whenFull` for the row's `title`.
 */
export function stageWhen(at: Date, now: Date = new Date()): string {
  if (isSameDay(at, now)) return "Today";
  if (isSameDay(at, subDays(now, 1))) return "Yesterday";
  const days = differenceInCalendarDays(now, at);
  if (days > 1 && days < 7) return format(at, "EEE");
  return format(at, "MMM d");
}

export function stageWhenFull(at: Date): string {
  return format(at, "EEEE, MMMM d, yyyy 'at' h:mm a");
}

/** One row of the history, already worded. Nothing below here reads a stage code. */
export type StageLogEntry = {
  id: string;
  /** Who moved it. Null means the system did — a webhook, the public booking form. */
  actor: string | null;
  /** The transition, in the reader's persona vocabulary. */
  from: string | null;
  to: string;
  /** Human reason, or null when the code is one we do not have words for. */
  reason: string | null;
  when: string;
  whenFull: string;
  at: Date;
};

export type StageLog = {
  /** Real moves, newest first. These are the only rows that render. */
  entries: StageLogEntry[];
  /** Seed and backfill rows, counted so the panel can admit they exist. */
  noiseCount: number;
  /** Summary line for the `<details>` toggle: `Stage history (4)`. */
  summary: string;
  /** A one-row history needs no toggle; the bar is that >2 rows must collapse. */
  collapsible: boolean;
  /** Said once under the entries when seed rows were dropped, in the quietest voice. */
  noiseNote: string | null;
};

/** How the system signs a move nobody clicked — a webhook, a public booking form. */
export const SYSTEM_ACTOR = "Tokos";

export function stageLog(
  events: readonly StageEventLike[],
  opts: { persona: StaffPersona; now?: Date },
): StageLog {
  const now = opts.now ?? new Date();
  const ordered = [...events].sort((a, b) => b.at.getTime() - a.at.getTime());
  const real = ordered.filter((event) => !isNoiseReason(event.reason));
  const noiseCount = ordered.length - real.length;

  const entries = real.map((event) => ({
    id: event.id,
    actor: event.actorName?.trim() ? event.actorName.trim() : null,
    // Rows written before TOK-49 still say `intro`/`fit`; they are read as their canonical
    // stage here so the log speaks the same vocabulary as the stepper above it.
    from: event.fromStage ? staffStageLabel(opts.persona, migrateStage(event.fromStage)) : null,
    to: staffStageLabel(opts.persona, migrateStage(event.toStage)),
    reason: humanStageReason(event.reason),
    when: stageWhen(event.at, now),
    whenFull: stageWhenFull(event.at),
    at: event.at,
  }));

  return {
    entries,
    noiseCount,
    summary: `Stage history (${entries.length})`,
    collapsible: entries.length > 0,
    noiseNote:
      noiseCount > 0
        ? `${noiseCount} earlier ${noiseCount === 1 ? "row" : "rows"} came from setup and carry no reason.`
        : null,
  };
}

/**
 * The line that has to stay above the fold: `Maya · Agreement signed · yesterday`.
 *
 * It reads the same `entries` the history does, so the sentence beside the stage control
 * and the top row of the log can never name two different moves. A record whose only
 * events are seed rows gets an honest absence rather than a fabricated story.
 */
export function stageStory(log: StageLog): string | null {
  const latest = log.entries[0];
  if (!latest) return null;
  const parts = [latest.actor ?? SYSTEM_ACTOR, latest.reason ?? latest.to, latest.when];
  return parts.join(" · ");
}
