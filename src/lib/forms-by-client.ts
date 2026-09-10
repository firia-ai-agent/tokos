/**
 * In-flight forms, organised by family (TOK-57).
 *
 * The founder, on the agency Forms page: "Have this section organized by Clients. Then you
 * can see how many incomplete contracts per client, and then when you click on the
 * client's name, it has a dropdown for all of the different assignments that are
 * incomplete. It has those three options on the side."
 *
 * What was there instead was one flat list — `Getting-to-know-you · Jordan Rivera`,
 * `Birth preferences · Jordan Rivera`, `Getting-to-know-you · Avery Kim` — where the
 * family's name is a suffix repeated down the page and the only way to learn that Jordan
 * owes three forms is to count. A doula does not work form-by-form; she works
 * family-by-family, so the family is the row and the forms are what is inside it.
 *
 * Pure: `formsHub` in `@/lib/queries` does the reads, this decides the shape.
 */

export type AssignmentLike = {
  assignment: { id: string; status: string; dueAt: Date | null; assigneeRole: string };
  template: { id: string; title: string };
  client: { id: string; displayName: string };
};

export type ClientFormGroup<T extends AssignmentLike = AssignmentLike> = {
  clientId: string;
  clientName: string;
  /** Still open, soonest due first. This is what the disclosure lists. */
  incomplete: T[];
  /** Already answered — counted on the row, not listed with an action beside it. */
  completeCount: number;
  /** Open forms that were due before today. Drives the coral edge. */
  overdueCount: number;
  total: number;
};

/** Due dates sort first, undated work last — an undated form is not more urgent. */
function byDue(a: AssignmentLike, b: AssignmentLike): number {
  const left = a.assignment.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const right = b.assignment.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return left - right || a.template.title.localeCompare(b.template.title);
}

export function isOverdue(
  assignment: { status: string; dueAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (assignment.status === "complete") return false;
  return Boolean(assignment.dueAt && assignment.dueAt.getTime() < now.getTime());
}

/**
 * One group per family that has *any* assignment, ordered by who needs the most chasing:
 * most open forms first, then alphabetically so the list is stable between renders.
 *
 * Families with nothing open still appear — with a zero and their completed count — so a
 * doula can see at a glance that Avery is done rather than wondering where Avery went.
 */
export function groupAssignmentsByClient<T extends AssignmentLike>(
  rows: readonly T[],
  now: Date = new Date(),
): ClientFormGroup<T>[] {
  const groups = new Map<string, ClientFormGroup<T>>();
  for (const row of rows) {
    let group = groups.get(row.client.id);
    if (!group) {
      group = {
        clientId: row.client.id,
        clientName: row.client.displayName,
        incomplete: [],
        completeCount: 0,
        overdueCount: 0,
        total: 0,
      };
      groups.set(row.client.id, group);
    }
    group.total += 1;
    if (row.assignment.status === "complete") {
      group.completeCount += 1;
    } else {
      group.incomplete.push(row);
      if (isOverdue(row.assignment, now)) group.overdueCount += 1;
    }
  }

  return [...groups.values()]
    .map((group) => ({ ...group, incomplete: [...group.incomplete].sort(byDue) }))
    .sort(
      (a, b) =>
        b.incomplete.length - a.incomplete.length || a.clientName.localeCompare(b.clientName),
    );
}

/** "3 waiting" / "All caught up" — the count that sits on the family's own row. */
export function groupCountLabel(group: ClientFormGroup): string {
  if (group.incomplete.length === 0) {
    return group.completeCount > 0 ? "All caught up" : "Nothing sent yet";
  }
  return `${group.incomplete.length} waiting`;
}

/** Only families with open work count toward the header number. */
export function familiesWithOpenForms(groups: readonly ClientFormGroup[]): number {
  return groups.filter((group) => group.incomplete.length > 0).length;
}
