/**
 * Family wording for the two status columns a client actually sees (TOK-41).
 *
 * `contracts.status` and `invoices.status` are operational codes — `sent`, `open` — and
 * rendering them raw is the same mistake as showing a family "new lead": accurate to the
 * database, useless to the person reading it. "Sent" tells a family what the office did;
 * "Ready to sign" tells them what is theirs to do next.
 *
 * The DB values are unchanged. Staff surfaces keep the codes, which is why these maps
 * live here and not in a shared formatter.
 */

/** Coral means "yours to do"; ink means "nothing owed". */
export type ClientStatusTone = "coral" | "ink";

export type ClientStatus = {
  label: string;
  tone: ClientStatusTone;
};

const CONTRACT_STATUSES: Record<string, ClientStatus> = {
  // A draft is not the family's turn yet, and saying "draft" invites them to look for it.
  draft: { label: "Being prepared", tone: "ink" },
  sent: { label: "Ready to sign", tone: "coral" },
  signed: { label: "Signed", tone: "ink" },
  complete: { label: "Complete", tone: "ink" },
  void: { label: "Withdrawn", tone: "ink" },
};

const INVOICE_STATUSES: Record<string, ClientStatus> = {
  open: { label: "Due", tone: "coral" },
  paid: { label: "Paid", tone: "ink" },
  void: { label: "Cancelled", tone: "ink" },
};

/**
 * An unknown code falls back to the quietest honest thing rather than echoing the code —
 * a family should never be the one to discover a new status string.
 */
export function contractStatusLabel(status: string): ClientStatus {
  return CONTRACT_STATUSES[status] ?? { label: "Being prepared", tone: "ink" };
}

export function invoiceStatusLabel(status: string): ClientStatus {
  return INVOICE_STATUSES[status] ?? { label: "Due", tone: "coral" };
}
