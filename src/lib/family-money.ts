/**
 * This family's money, as work rather than wallpaper (TOK-77).
 *
 * The card this replaces printed `Postpartum package · sent · $1,200.00` and stopped. Every
 * fact on it was true and none of it was actionable: to chase the invoice it named, Maya
 * left the record for `/doula/invoices`, found the row again, and came back. A money
 * section on a family record that cannot complete a money step is a museum label.
 *
 * So the shape below is a list of rows that each **end in a verb**, and the verbs are
 * state-driven — a settled invoice offers no chase, a signed agreement offers no resend,
 * and a family with no contract at all offers exactly one thing to do. Deciding that here
 * rather than in the component is what makes it testable, and what stops the card and the
 * invoice dashboard from disagreeing about whether money is owed.
 *
 * Two borrowed truths, on purpose:
 *  - `staffInvoiceStatus` (TOK-55) decides invoice wording, so Paid is still gated on
 *    `isPaymentCleared` (TOK-48) here exactly as it is in the ledger.
 *  - `contractStatusLabel` (TOK-41) decides contract wording. Raw `sent`/`open` reaching a
 *    human is the failure this ticket exists to kill, on staff surfaces too.
 */

import { format } from "date-fns";
import { contractStatusLabel, type ClientStatus } from "@/lib/client-status";
import {
  invoiceMoneyState,
  staffInvoiceStatus,
  type InvoiceRecord,
  type StaffInvoiceStatus,
} from "@/lib/invoice-dashboard";
import { formatCents } from "@/lib/money";
import type { DoulaQuickAction } from "@/lib/pipeline";

/** The `contracts` columns this module reads. Flat, so a test needs no database. */
export type ContractLike = {
  id: string;
  packageLabel: string;
  amountCents: number;
  currency?: string | null;
  status: string;
  sentAt?: Date | null;
  signedAt?: Date | null;
  /** `esign_artifacts.document_url` for this contract, when the provider gave one. */
  documentUrl?: string | null;
  /** `esign_artifacts.provider`. Absent means the agreement was never dispatched. */
  provider?: string | null;
};

/** The `invoices` columns plus the payment row that rides along with its contract. */
export type InvoiceLike = Pick<
  InvoiceRecord,
  "id" | "number" | "status" | "paymentStatus" | "amountCents" | "currency" | "dueAt"
>;

/** Statuses that mean this contract is over and a fresh one may go out. */
const DEAD_CONTRACT = new Set(["void", "voided", "withdrawn", "canceled", "cancelled"]);

/** Statuses that mean the family has not signed yet — the resend/chase window. */
const UNSIGNED = new Set(["sent", "awaiting_signature", "pending"]);

export type FamilyContractRow = {
  id: string;
  packageLabel: string;
  amountLabel: string;
  status: ClientStatus;
  /** `Sent Mar 4` / `Signed Mar 6` — the date that explains the status, never both. */
  whenLabel: string | null;
  /** Open agreement. Null only while there is nothing dispatched to open. */
  agreementHref: string | null;
  /** Nudge the family's copy of an agreement they have not signed. */
  canResend: boolean;
};

export type FamilyInvoiceRow = {
  id: string;
  number: string;
  amountLabel: string;
  status: StaffInvoiceStatus;
  /** `Due Mar 18` — omitted once the money has landed or the bill was called off. */
  dueLabel: string | null;
  /** The ledger, narrowed to this invoice, for the staff who want the full row. */
  openHref: string;
  canMarkPaid: boolean;
  canChase: boolean;
};

export type FamilyMoney = {
  contracts: FamilyContractRow[];
  invoices: FamilyInvoiceRow[];
  /** The single primary verb when this family has no live agreement. */
  canSendContract: boolean;
  /** Nothing sent and nothing billed — the card says so instead of drawing empty rows. */
  empty: boolean;
};

/** `/doula/clients/{id}/agreement?contractId=…` — the staff-side view of an agreement. */
export function agreementHref(clientId: string, contractId: string): string {
  return `/doula/clients/${clientId}/agreement?contractId=${contractId}`;
}

/** The ledger filtered to one invoice, so "Open invoice" lands on the row, not the page. */
export function invoiceHref(number: string): string {
  return `/doula/invoices?q=${encodeURIComponent(number)}`;
}

/**
 * Where the family signs.
 *
 * A real provider hands back a document URL and that is the truth. The stub adapter does
 * not, and its sign page is a client-session page — which is the point: this URL is what
 * we *send the family*, not somewhere staff can go instead of them. Both the resend email
 * and the copyable link on the staff agreement view read it from here so they cannot
 * point at two different places.
 */
export function familySignUrl(
  contract: Pick<ContractLike, "id" | "documentUrl">,
  baseUrl: string,
): string {
  if (contract.documentUrl) return contract.documentUrl;
  return `${baseUrl}/stub/sign?contractId=${contract.id}`;
}

/** True while this contract still stands — a voided one is not "the" agreement. */
export function isLiveContract(contract: Pick<ContractLike, "status">): boolean {
  return !DEAD_CONTRACT.has(contract.status);
}

export function isUnsignedContract(
  contract: Pick<ContractLike, "status" | "signedAt">,
): boolean {
  if (contract.signedAt) return false;
  return UNSIGNED.has(contract.status);
}

function contractWhen(contract: ContractLike): string | null {
  if (contract.signedAt) return `Signed ${format(contract.signedAt, "MMM d")}`;
  if (contract.sentAt) return `Sent ${format(contract.sentAt, "MMM d")}`;
  return null;
}

/**
 * Build the card.
 *
 * `allowedActions` is `allowedDoulaActions` for this family, passed in rather than
 * recomputed, so the funnel rule that decides whether a contract may go out at all is the
 * one TOK-49 already wrote, not a second copy of it. The money card then narrows further
 * than the stage strip does — it will not offer Send contract beside a live agreement —
 * because a card whose whole job is this family's money is the place that knows one is
 * already out.
 */
export function familyMoney(input: {
  clientId: string;
  contracts: readonly ContractLike[];
  invoices: readonly InvoiceLike[];
  allowedActions: readonly DoulaQuickAction[];
  now?: Date;
}): FamilyMoney {
  const now = input.now ?? new Date();

  const contracts = input.contracts.map((contract): FamilyContractRow => ({
    id: contract.id,
    packageLabel: contract.packageLabel,
    amountLabel: formatCents(contract.amountCents, contract.currency ?? "usd"),
    status: contractStatusLabel(contract.status),
    whenLabel: contractWhen(contract),
    // A draft nobody has dispatched has no agreement to open, and neither does a voided
    // one. Everything else — sent, signed, complete — is a document staff may read.
    agreementHref:
      contract.status === "draft" || !isLiveContract(contract)
        ? null
        : agreementHref(input.clientId, contract.id),
    canResend: isLiveContract(contract) && isUnsignedContract(contract),
  }));

  const invoices = input.invoices.map((invoice): FamilyInvoiceRow => {
    const state = invoiceMoneyState(invoice, now);
    // Still owed, whether or not it is late. Cleared, refunded and cancelled bills are
    // finished business: offering to chase them is how a family gets asked twice.
    const owed = state === "outstanding" || state === "overdue";
    return {
      id: invoice.id,
      number: invoice.number,
      amountLabel: formatCents(invoice.amountCents, invoice.currency),
      status: staffInvoiceStatus(invoice, now),
      dueLabel: owed && invoice.dueAt ? `Due ${format(invoice.dueAt, "MMM d")}` : null,
      openHref: invoiceHref(invoice.number),
      canMarkPaid: owed,
      canChase: owed,
    };
  });

  // One live agreement is enough. Offering "Send contract" beside a contract that is
  // already out is how a family receives the same paperwork twice.
  const hasLiveContract = input.contracts.some(isLiveContract);

  return {
    contracts,
    invoices,
    canSendContract: input.allowedActions.includes("send_contract") && !hasLiveContract,
    empty: contracts.length === 0 && invoices.length === 0,
  };
}

/** Every string the money card renders, declared once (TOK-55 house style). */
export const MONEY_COPY = {
  title: "Contracts & invoices",
  ledgerLink: "Full invoicing",
  empty: "Nothing billed yet. Sending the care agreement raises the invoice from the package amount.",
  sendContract: "Send contract",
  sendContractHint: "Raises the invoice from the package amount and emails the agreement.",
  openAgreement: "Open agreement",
  resendAgreement: "Resend agreement",
  openInvoice: "Open invoice",
  markPaid: "Mark paid",
  chase: "Chase payment",
  chased: "Reminder sent to the family — it is in her inbox and the outbox log.",
  recorded: "Payment recorded. The family reads it as Paid and the record has moved on.",
  resent: "Agreement sent again. The family has a fresh link to sign.",
  chaseError: "That invoice is settled — no reminder was sent.",
} as const;

/** Notices the family record shows after a money action, keyed by the `?money=` value. */
export const MONEY_NOTICES: Record<string, { tone: "teal" | "coral"; text: string }> = {
  recorded: { tone: "teal", text: MONEY_COPY.recorded },
  chased: { tone: "teal", text: MONEY_COPY.chased },
  signed: { tone: "coral", text: "That agreement is already signed — nothing was sent." },
  resent: { tone: "teal", text: MONEY_COPY.resent },
  cleared: { tone: "coral", text: MONEY_COPY.chaseError },
  missing: { tone: "coral", text: "That record could not be found in your practice." },
};
