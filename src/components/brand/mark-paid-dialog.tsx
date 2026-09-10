"use client";

import { useState } from "react";
import { INVOICE_COPY } from "@/lib/invoice-dashboard";
import { recordExternalPaymentAction } from "@/app/actions/invoices";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The confirm step behind "Mark paid" (TOK-55, shared in TOK-77).
 *
 * Recording an external payment is the one control in the product where a person, not
 * Stripe, declares that money landed, so it asks out loud rather than clearing an invoice
 * on a stray click. TOK-77 put the same verb on the family record, and the answer to
 * "two places need this" is one dialog, not a second copy that drifts: the day the
 * reference field grows a rule, it grows it once.
 *
 * `returnClientId` is the only difference between the two callers — set it and the action
 * comes back to the family record instead of the ledger.
 */
export function MarkPaidDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  familyName,
  amountLabel,
  returnClientId,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  familyName: string;
  amountLabel: string;
  returnClientId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading text-teal-ink">
            {INVOICE_COPY.markPaid.heading}
          </DialogTitle>
          <DialogDescription>{INVOICE_COPY.markPaid.blurb}</DialogDescription>
        </DialogHeader>
        <p className="rounded-lg bg-cloud px-3 py-2 text-[13px] text-teal-ink ring-1 ring-teal/15">
          <span className="font-semibold">{invoiceNumber}</span> · {familyName} ·{" "}
          <span className="font-heading tabular-nums">{amountLabel}</span>
        </p>
        <form action={recordExternalPaymentAction} className="grid gap-2">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          {returnClientId ? (
            <input type="hidden" name="returnClientId" value={returnClientId} />
          ) : null}
          <label className="grid gap-1">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {INVOICE_COPY.markPaid.reference}
            </span>
            <input
              name="reference"
              placeholder="Cheque 1042"
              className="h-9 w-full rounded-lg border border-teal/20 bg-card px-2.5 text-[13px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25"
            />
            <span className="text-[11.5px] text-muted-foreground">
              {INVOICE_COPY.markPaid.referenceHint}
            </span>
          </label>
          <button
            type="submit"
            className="mt-1 inline-flex h-9 items-center justify-center rounded-lg bg-teal px-3.5 text-[13px] font-semibold text-cloud shadow-sm transition-colors hover:bg-teal/90"
          >
            {INVOICE_COPY.markPaid.submit}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The "Mark paid" verb on a family's money row (TOK-77), with the same confirm behind it.
 *
 * The ledger reaches the dialog through a `⋯` menu because it has forty rows and no space
 * for three buttons on each; a family record has one or two, and hiding the money verb
 * behind a menu there is what made the old card feel like a display case.
 */
export function MarkPaidButton({
  invoiceId,
  invoiceNumber,
  familyName,
  amountLabel,
  returnClientId,
  label,
}: {
  invoiceId: string;
  invoiceNumber: string;
  familyName: string;
  amountLabel: string;
  returnClientId: string;
  label: string;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-8 items-center justify-center rounded-lg bg-teal px-3 text-[12.5px] font-semibold text-cloud shadow-sm transition-colors hover:bg-teal/90"
      >
        {label}
      </button>
      <MarkPaidDialog
        open={confirming}
        onOpenChange={setConfirming}
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber}
        familyName={familyName}
        amountLabel={amountLabel}
        returnClientId={returnClientId}
      />
    </>
  );
}
