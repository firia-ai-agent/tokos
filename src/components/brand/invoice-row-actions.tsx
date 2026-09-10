"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { INVOICE_COPY } from "@/lib/invoice-dashboard";
import { recordExternalPaymentAction } from "@/app/actions/invoices";

/**
 * The `⋯` at the end of an invoice row (TOK-55).
 *
 * "Record a payment taken outside Tokos" is the founder's manual-payment ask, and it is
 * the only control in the product where a person, not Stripe, declares that money landed.
 * It therefore asks out loud — a confirm step with a reference box — rather than clearing
 * an invoice on a single stray click, and it is absent entirely on an invoice that is
 * already settled or cancelled.
 */
export function InvoiceRowActions({
  invoiceId,
  invoiceNumber,
  familyId,
  familyName,
  amountLabel,
  canRecordPayment,
}: {
  invoiceId: string;
  invoiceNumber: string;
  familyId: string;
  familyName: string;
  amountLabel: string;
  canRecordPayment: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${INVOICE_COPY.table.rowActions} — ${invoiceNumber}`}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-teal/10 hover:text-teal-ink"
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem asChild>
            <Link href={`/doula/clients/${familyId}`}>
              {INVOICE_COPY.table.openFamily} · {familyName}
            </Link>
          </DropdownMenuItem>
          {canRecordPayment ? (
            <DropdownMenuItem onSelect={() => setConfirming(true)}>
              {INVOICE_COPY.table.markPaidShort}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirming} onOpenChange={setConfirming}>
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
    </>
  );
}
