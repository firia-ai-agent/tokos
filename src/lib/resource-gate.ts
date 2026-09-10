/**
 * When a family's handouts open (TOK-39 E2).
 *
 * NOVA's rule in Dubsado, confirmed for the cutover: birth-prep resources are part of
 * the engagement, not the sales pitch. They open once the care agreement is **signed**
 * and the **first payment has cleared** — the same two facts that make a contract
 * `complete` (see the Complete rule in the README). Signing alone is intent; money
 * alone is a deposit against nothing.
 *
 * The locked copy names the assigned doula, like every other client surface (TOK-38),
 * and never says "locked by policy" — a family reads one sentence about what has to
 * happen and one line about whose turn it is.
 *
 * Pure on purpose: the page reads the rows, this decides. `resourcesUnlocked` is the
 * single predicate both `/portal/resources` and `markResourceDoneAction` call, so a
 * POST cannot walk past a gate the page drew.
 */

import { isPaymentCleared } from "@/lib/payment";

/** A contract counts as signed once the family has put their name on it. */
const SIGNED_CONTRACT = new Set(["signed", "complete"]);

export type ResourceGateInput = {
  /** Every contract status this family has, in any order. */
  contractStatuses: readonly string[];
  /** Every invoice status this family has, in any order. */
  invoiceStatuses: readonly string[];
  /** The assigned doula — "Maya Chen" — or the practice when nobody is matched yet. */
  doulaName: string;
  doulaFirstName: string;
};

export type ResourceGate = {
  locked: boolean;
  signed: boolean;
  paid: boolean;
  /** Heading for the locked card. */
  title: string;
  /** The rule, in one sentence, naming the doula. */
  body: string;
  /** Whose turn it is next — never a restatement of the rule. */
  hint: string;
  /** Where to go do the outstanding half, when there is something to do. */
  next: { label: string; href: string } | null;
};

export function hasSignedContract(statuses: readonly string[]): boolean {
  return statuses.some((status) => SIGNED_CONTRACT.has(status));
}

/**
 * Only a cleared invoice counts. `open` is a bill, not a payment, and `failed` is the
 * absence of one — `isPaymentCleared` is the same predicate the funnel and the pay page
 * use, so the shelf can never open on money the portal calls Due (TOK-48).
 */
export function hasClearedPayment(statuses: readonly string[]): boolean {
  return statuses.some((status) => isPaymentCleared({ invoiceStatus: status }));
}

/** The predicate. Both halves, or the shelf stays shut. */
export function resourcesUnlocked(input: {
  contractStatuses: readonly string[];
  invoiceStatuses: readonly string[];
}): boolean {
  return (
    hasSignedContract(input.contractStatuses) && hasClearedPayment(input.invoiceStatuses)
  );
}

export function resourceGate({
  contractStatuses,
  invoiceStatuses,
  doulaName,
  doulaFirstName,
}: ResourceGateInput): ResourceGate {
  const signed = hasSignedContract(contractStatuses);
  const paid = hasClearedPayment(invoiceStatuses);
  const locked = !(signed && paid);

  // The sentence the ticket specifies, with the assigned name substituted in.
  const body = `Available after your agreement with ${doulaName} is signed and paid.`;

  if (!locked) {
    return { locked, signed, paid, title: "Resources", body, hint: "", next: null };
  }

  const readyToSign = contractStatuses.includes("sent");
  const openInvoice = invoiceStatuses.includes("open");

  if (!signed) {
    return {
      locked,
      signed,
      paid,
      title: "Your handouts open once you are signed up",
      body,
      hint: readyToSign
        ? "Your agreement is waiting for you."
        : `${doulaName} sends the agreement here after your fit consult.`,
      next: readyToSign
        ? { label: "Review and sign your agreement", href: "/portal/contract" }
        : null,
    };
  }

  // Signed, not paid — thank them for the half they did rather than repeating the rule.
  return {
    locked,
    signed,
    paid,
    title: "Almost — one step left",
    body,
    hint: openInvoice
      ? "Thanks for signing. The first payment opens your handouts."
      : `Thanks for signing. ${doulaFirstName} sends the first invoice here.`,
    next: openInvoice ? { label: "Open your invoice", href: "/portal/pay" } : null,
  };
}
