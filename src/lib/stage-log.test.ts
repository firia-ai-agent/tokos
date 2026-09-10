import { describe, expect, it } from "vitest";
import {
  humanStageReason,
  isNoiseReason,
  stageLog,
  stageStory,
  stageWhen,
  SYSTEM_ACTOR,
  type StageEventLike,
} from "@/lib/stage-log";

const NOW = new Date("2026-09-10T14:00:00.000Z");

function event(over: Partial<StageEventLike> & { id: string }): StageEventLike {
  return {
    fromStage: "fit_confirmed",
    toStage: "agreement_signed",
    reason: "agreement_signed",
    at: new Date("2026-09-09T10:00:00.000Z"),
    actorName: "Maya Chen",
    ...over,
  };
}

describe("humanStageReason", () => {
  it("gives every reason the product writes a sentence a person would say", () => {
    expect(humanStageReason("agreement_signed")).toBe("Agreement signed");
    expect(humanStageReason("payment_cleared")).toBe("Payment cleared");
    expect(humanStageReason("stage_set_backward")).toBe("Moved back by hand");
    expect(humanStageReason("csv_import")).toBe("Imported from a CSV");
  });

  it("refuses to invent a sentence for a code it does not know", () => {
    expect(humanStageReason("some_future_reason")).toBeNull();
  });

  it("treats seed and empty reasons as noise, not as facts", () => {
    for (const reason of ["seed", "", "   ", null, undefined]) {
      expect(isNoiseReason(reason)).toBe(true);
      expect(humanStageReason(reason)).toBeNull();
    }
    expect(isNoiseReason("fit_confirmed")).toBe(false);
  });
});

describe("stageWhen", () => {
  it("climbs the same ladder the inbox stamp does", () => {
    expect(stageWhen(new Date("2026-09-10T02:00:00.000Z"), NOW)).toBe("Today");
    expect(stageWhen(new Date("2026-09-09T23:00:00.000Z"), NOW)).toBe("Yesterday");
    expect(stageWhen(new Date("2026-09-07T09:00:00.000Z"), NOW)).toBe("Mon");
    expect(stageWhen(new Date("2026-06-04T09:00:00.000Z"), NOW)).toBe("Jun 4");
  });
});

describe("stageLog", () => {
  const seeded: StageEventLike[] = [
    event({ id: "seed-1", reason: "seed", actorName: null, at: new Date("2026-08-01T09:00:00.000Z") }),
    event({ id: "seed-2", reason: null, actorName: null, at: new Date("2026-08-02T09:00:00.000Z") }),
    event({
      id: "real-1",
      reason: "fit_confirmed",
      fromStage: "consult_done",
      toStage: "fit_confirmed",
      at: new Date("2026-09-04T09:00:00.000Z"),
    }),
    event({ id: "real-2", at: new Date("2026-09-09T10:00:00.000Z") }),
  ];

  it("drops seed rows from the visible list and counts them instead", () => {
    const log = stageLog(seeded, { persona: "doula", now: NOW });
    expect(log.entries.map((entry) => entry.id)).toEqual(["real-2", "real-1"]);
    expect(log.noiseCount).toBe(2);
    expect(log.noiseNote).toContain("2 earlier rows");
  });

  it("gives every visible row an actor, a human reason and a when", () => {
    const log = stageLog(seeded, { persona: "doula", now: NOW });
    for (const entry of log.entries) {
      expect(entry.actor).toBeTruthy();
      expect(entry.reason).toBeTruthy();
      expect(entry.when).toBeTruthy();
    }
    expect(log.entries[0]).toMatchObject({
      actor: "Maya Chen",
      reason: "Agreement signed",
      when: "Yesterday",
      from: "Fit confirmed",
      to: "Agreement signed",
    });
  });

  it("summarises the real count, so the toggle never promises seed rows", () => {
    expect(stageLog(seeded, { persona: "doula", now: NOW }).summary).toBe("Stage history (2)");
  });

  it("collapses whenever there is anything to collapse — the >2 bar included", () => {
    const many = [1, 2, 3, 4].map((n) =>
      event({ id: `e${n}`, at: new Date(`2026-09-0${n}T09:00:00.000Z`) }),
    );
    const log = stageLog(many, { persona: "doula", now: NOW });
    expect(log.entries).toHaveLength(4);
    expect(log.collapsible).toBe(true);
  });

  it("reads legacy stage codes as their canonical stage, like the stepper above it", () => {
    const log = stageLog(
      [event({ id: "legacy", fromStage: "intro", toStage: "fit", reason: "consult_booked" })],
      { persona: "agency", now: NOW },
    );
    expect(log.entries[0]).toMatchObject({ from: "Outreach sent", to: "Consult scheduled" });
  });

  it("words the transition for the persona reading it", () => {
    const move = [event({ id: "m", fromStage: null, toStage: "new_lead", reason: "csv_import" })];
    expect(stageLog(move, { persona: "agency", now: NOW }).entries[0].to).toBe("New lead");
    expect(stageLog(move, { persona: "doula", now: NOW }).entries[0].to).toBe("New family");
  });

  it("says nothing at all rather than something wrong when every row is seed", () => {
    const log = stageLog([seeded[0], seeded[1]], { persona: "doula", now: NOW });
    expect(log.entries).toEqual([]);
    expect(log.collapsible).toBe(false);
    expect(stageStory(log)).toBeNull();
  });
});

describe("stageStory", () => {
  it("is the last real move, as actor · why · when", () => {
    const log = stageLog(
      [
        event({ id: "seed", reason: "seed", at: new Date("2026-09-10T11:00:00.000Z") }),
        event({ id: "real", at: new Date("2026-09-09T10:00:00.000Z") }),
      ],
      { persona: "doula", now: NOW },
    );
    expect(stageStory(log)).toBe("Maya Chen · Agreement signed · Yesterday");
  });

  it("signs a move nobody clicked as the system rather than inventing a person", () => {
    const log = stageLog(
      [event({ id: "web", actorName: null, reason: "public_book_consult", at: NOW })],
      { persona: "doula", now: NOW },
    );
    expect(stageStory(log)).toBe(`${SYSTEM_ACTOR} · Booked a consult online · Today`);
  });

  it("falls back to the stage reached when the reason code is unknown", () => {
    const log = stageLog(
      [event({ id: "odd", reason: "brand_new_code", toStage: "active_care", at: NOW })],
      { persona: "doula", now: NOW },
    );
    expect(stageStory(log)).toBe("Maya Chen · Active care · Today");
  });
});
