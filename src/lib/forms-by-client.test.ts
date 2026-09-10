import { describe, expect, it } from "vitest";
import {
  familiesWithOpenForms,
  groupAssignmentsByClient,
  groupCountLabel,
  isOverdue,
  type AssignmentLike,
} from "./forms-by-client";

const NOW = new Date("2026-09-10T12:00:00Z");

function row(
  clientName: string,
  title: string,
  status: "incomplete" | "complete" = "incomplete",
  dueAt: Date | null = null,
): AssignmentLike {
  return {
    assignment: { id: `${clientName}:${title}`, status, dueAt, assigneeRole: "client" },
    template: { id: title, title },
    client: { id: `c-${clientName}`, displayName: clientName },
  };
}

describe("grouping in-flight forms by family", () => {
  it("turns a flat list into one row per family", () => {
    const groups = groupAssignmentsByClient(
      [
        row("Jordan Rivera", "Getting-to-know-you"),
        row("Avery Kim", "Getting-to-know-you"),
        row("Jordan Rivera", "Birth preferences"),
        row("Jordan Rivera", "First two weeks at home"),
      ],
      NOW,
    );
    expect(groups.map((group) => [group.clientName, group.incomplete.length])).toEqual([
      ["Jordan Rivera", 3],
      ["Avery Kim", 1],
    ]);
  });

  it("counts answered forms without listing them as work", () => {
    const [group] = groupAssignmentsByClient(
      [
        row("Jordan Rivera", "Getting-to-know-you", "complete"),
        row("Jordan Rivera", "Birth preferences"),
      ],
      NOW,
    );
    expect(group.incomplete).toHaveLength(1);
    expect(group.completeCount).toBe(1);
    expect(group.total).toBe(2);
  });

  it("keeps a family who has finished everything, with a zero", () => {
    const groups = groupAssignmentsByClient(
      [row("Avery Kim", "Getting-to-know-you", "complete")],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].incomplete).toHaveLength(0);
    expect(groupCountLabel(groups[0])).toBe("All caught up");
  });

  it("lists the soonest due form first and undated work last", () => {
    const [group] = groupAssignmentsByClient(
      [
        row("Jordan Rivera", "No date"),
        row("Jordan Rivera", "Later", "incomplete", new Date("2026-10-01T00:00:00Z")),
        row("Jordan Rivera", "Sooner", "incomplete", new Date("2026-09-12T00:00:00Z")),
      ],
      NOW,
    );
    expect(group.incomplete.map((item) => item.template.title)).toEqual([
      "Sooner",
      "Later",
      "No date",
    ]);
  });

  it("counts overdue open work and never calls a finished form late", () => {
    const past = new Date("2026-09-01T00:00:00Z");
    expect(isOverdue({ status: "incomplete", dueAt: past }, NOW)).toBe(true);
    expect(isOverdue({ status: "complete", dueAt: past }, NOW)).toBe(false);
    expect(isOverdue({ status: "incomplete", dueAt: null }, NOW)).toBe(false);

    const [group] = groupAssignmentsByClient(
      [
        row("Jordan Rivera", "Late", "incomplete", past),
        row("Jordan Rivera", "Fine", "incomplete", new Date("2026-12-01T00:00:00Z")),
      ],
      NOW,
    );
    expect(group.overdueCount).toBe(1);
  });

  it("counts only families with open work in the header", () => {
    const groups = groupAssignmentsByClient(
      [
        row("Jordan Rivera", "Open"),
        row("Avery Kim", "Done", "complete"),
      ],
      NOW,
    );
    expect(familiesWithOpenForms(groups)).toBe(1);
    expect(groupCountLabel(groups[0])).toBe("1 waiting");
  });

  it("says so plainly when a family has never been sent anything", () => {
    expect(
      groupCountLabel({
        clientId: "c",
        clientName: "New Family",
        incomplete: [],
        completeCount: 0,
        overdueCount: 0,
        total: 0,
      }),
    ).toBe("Nothing sent yet");
  });
});
