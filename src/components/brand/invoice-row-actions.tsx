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
import { INVOICE_COPY } from "@/lib/invoice-dashboard";
import { MarkPaidDialog } from "@/components/brand/mark-paid-dialog";

/**
 * The `⋯` at the end of an invoice row (TOK-55).
 *
 * "Record a payment taken outside Tokos" is the founder's manual-payment ask, and it is
 * the only control in the product where a person, not Stripe, declares that money landed.
 * The confirm step it opens is `MarkPaidDialog`, shared with the family record (TOK-77),
 * and it is absent entirely on an invoice that is already settled or cancelled.
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

      <MarkPaidDialog
        open={confirming}
        onOpenChange={setConfirming}
        invoiceId={invoiceId}
        invoiceNumber={invoiceNumber}
        familyName={familyName}
        amountLabel={amountLabel}
      />
    </>
  );
}
