/**
 * The client Home checklist. `clientChecklist` in `@/lib/queries` counts the real rows;
 * this turns those counts into the six cards, including the labelled count ("2 open",
 * "1 unread") so a family never has to guess what a bare number means.
 *
 * Actionable cards — forms, agreement, pay, unread messages — go coral while anything is
 * waiting and Teal Ink once the family is caught up. Resources and consults are context,
 * not chores, so they never go coral.
 */

export type ChecklistCounts = {
  incompleteForms: number;
  unsignedContracts: number;
  openInvoices: number;
  unreadMessages: number;
  openResources: number;
  upcomingConsults: number;
};

export type ChecklistCard = {
  key: keyof ChecklistCounts;
  href: string;
  label: string;
  detail: string;
  count: number;
  /** "2 open" / "1 unread" / "Nothing due" — never a naked number. */
  countLabel: string;
  /** True when this card is a chore the family still owes. */
  actionable: boolean;
  tone: "coral" | "ink";
  /** Resources before the agreement is signed and paid (TOK-39 E2). */
  locked?: boolean;
};

type CardSpec = {
  key: keyof ChecklistCounts;
  href: string;
  label: string;
  /** Named copy: the family reads "Maya Chen", never "your doula" (TOK-38). */
  detail: (doula: string) => string;
  /** Word after the count: "2 open", "1 unread". */
  noun: string;
  /** What to say at zero. */
  zero: string;
  /** Chores go coral while open; context cards never do. */
  chore: boolean;
};

const CARDS: readonly CardSpec[] = [
  {
    key: "incompleteForms",
    href: "/portal/forms",
    label: "Forms",
    detail: () => "Getting-to-know-you and preferences",
    noun: "open",
    zero: "All done",
    chore: true,
  },
  {
    key: "unsignedContracts",
    href: "/portal/contract",
    label: "Agreement",
    detail: () => "Review and sign when you are ready",
    noun: "to sign",
    zero: "Nothing to sign",
    chore: true,
  },
  {
    key: "openInvoices",
    href: "/portal/pay",
    label: "Pay",
    detail: () => "Invoices open in your portal",
    noun: "open",
    zero: "Nothing due",
    chore: true,
  },
  {
    key: "unreadMessages",
    href: "/portal/messages",
    label: "Messages",
    detail: (doula) => `Write to ${doula}, and read the replies`,
    noun: "unread",
    zero: "No new messages",
    chore: true,
  },
  {
    key: "openResources",
    href: "/portal/resources",
    label: "Resources",
    detail: (doula) => `Handouts ${doula} shared for birth prep`,
    noun: "new",
    zero: "All read",
    chore: false,
  },
  {
    key: "upcomingConsults",
    href: "/portal/calendar",
    label: "Visits",
    detail: (doula) => `Time booked with ${doula}`,
    noun: "booked",
    zero: "None booked",
    chore: false,
  },
];

/**
 * `doulaName` is the assigned doula's display name — "Maya Chen" — or the practice name
 * when the family has not been matched yet. It is resolved once per render by
 * `resolveAssignedDoulaName`, so every card names the same person.
 */
export function checklistCards(
  counts: ChecklistCounts,
  doulaName = "your care team",
  options: { resourcesLocked?: boolean } = {},
): ChecklistCard[] {
  return CARDS.map((spec) => {
    const count = counts[spec.key] ?? 0;

    // A locked shelf must not tease its contents. The card says when it opens and
    // shows no number, because "3 new" the family cannot read is worse than silence.
    if (spec.key === "openResources" && options.resourcesLocked) {
      return {
        key: spec.key,
        href: spec.href,
        label: spec.label,
        detail: `Handouts ${doulaName} shares once your agreement is signed and paid`,
        count: 0,
        countLabel: "Opens after signing",
        actionable: false,
        tone: "ink" as const,
        locked: true,
      };
    }

    return {
      key: spec.key,
      href: spec.href,
      label: spec.label,
      detail: spec.detail(doulaName),
      count,
      countLabel: count > 0 ? `${count} ${spec.noun}` : spec.zero,
      actionable: spec.chore && count > 0,
      tone: spec.chore && count > 0 ? "coral" : "ink",
    };
  });
}

/** Only the chores count as "on your checklist" — booked consults are not homework. */
export function openTaskCount(counts: ChecklistCounts): number {
  return (
    (counts.incompleteForms ?? 0) +
    (counts.unsignedContracts ?? 0) +
    (counts.openInvoices ?? 0) +
    (counts.unreadMessages ?? 0)
  );
}

/**
 * The line under the greeting. "Items on your checklist" was the last piece of office
 * vocabulary left on Home (TOK-35) — a family is not working a queue. This is the only
 * place the number appears now; Home used to print it again as a "6 to do" badge, which
 * read like a ticket count sitting next to a welcome.
 */
export function checklistSummary(counts: ChecklistCounts): string {
  const open = openTaskCount(counts);
  if (open === 0) return "Nothing waiting on you today";
  return `${open} thing${open === 1 ? "" : "s"} waiting for you`;
}
