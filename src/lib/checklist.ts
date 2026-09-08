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
};

type CardSpec = {
  key: keyof ChecklistCounts;
  href: string;
  label: string;
  detail: string;
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
    detail: "Getting-to-know-you and preferences",
    noun: "open",
    zero: "All done",
    chore: true,
  },
  {
    key: "unsignedContracts",
    href: "/portal/contract",
    label: "Agreement",
    detail: "Review and sign when you are ready",
    noun: "to sign",
    zero: "Nothing to sign",
    chore: true,
  },
  {
    key: "openInvoices",
    href: "/portal/pay",
    label: "Pay",
    detail: "Invoices open in your portal",
    noun: "open",
    zero: "Nothing due",
    chore: true,
  },
  {
    key: "unreadMessages",
    href: "/portal/messages",
    label: "Messages",
    detail: "Write to your doula, and read her replies",
    noun: "unread",
    zero: "No new messages",
    chore: true,
  },
  {
    key: "openResources",
    href: "/portal/resources",
    label: "Resources",
    detail: "Handouts shared for birth prep",
    noun: "new",
    zero: "All read",
    chore: false,
  },
  {
    key: "upcomingConsults",
    href: "/portal/calendar",
    label: "Consults",
    detail: "Fit visits on your doula's calendar",
    noun: "booked",
    zero: "None booked",
    chore: false,
  },
];

export function checklistCards(counts: ChecklistCounts): ChecklistCard[] {
  return CARDS.map((spec) => {
    const count = counts[spec.key] ?? 0;
    return {
      key: spec.key,
      href: spec.href,
      label: spec.label,
      detail: spec.detail,
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

/** The line under the greeting. */
export function checklistSummary(counts: ChecklistCounts): string {
  const open = openTaskCount(counts);
  if (open === 0) return "You are all caught up";
  return `${open} item${open === 1 ? "" : "s"} on your checklist`;
}
