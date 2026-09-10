import { format } from "date-fns";
import { requireClient } from "@/lib/tenancy";
import { resolveAssignedDoulaName } from "@/lib/assigned-doula";
import { payInvoiceAction } from "@/app/actions/client";
import { familyInvoices } from "@/lib/queries";
import {
  displayLines,
  dueNote,
  familyInvoiceCount,
  familyPayCopy,
  familyPayGroups,
  opensByDefault,
  type FamilyPayItem,
} from "@/lib/family-pay";
import { formatCents } from "@/lib/money";
import { EmptyState } from "@/components/brand/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function shortDate(value: Date) {
  return format(value, "MMM d, yyyy");
}

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ unpaid?: string; pending?: string; result?: string }>;
}) {
  const session = await requireClient();
  const { unpaid, pending, result } = await searchParams;
  const doula = await resolveAssignedDoulaName({
    organizationId: session.organizationId,
    clientId: session.clientId,
  });
  const copy = familyPayCopy(doula);
  const now = new Date();

  // The payment row rides along with the invoice (TOK-48). `invoices.status` alone cannot
  // be trusted to say "Paid" out loud: if the two tables ever disagree, the row that
  // touched the money wins, and the family is never told about a payment that isn't there.
  const invoices = await familyInvoices(session.organizationId, session.clientId);

  if (invoices.length === 0) {
    return (
      <div className="space-y-4">
        <PayHeader title={copy.title} subtitle={copy.subtitle} />
        <EmptyState title={copy.noInvoices.title} body={copy.noInvoices.body} />
      </div>
    );
  }

  const groups = familyPayGroups(invoices);

  return (
    <div className="space-y-4">
      <PayHeader title={copy.title} subtitle={copy.subtitle} />

      {unpaid ? (
        <Alert>
          <AlertDescription>
            Payment did not go through{result ? ` (${result})` : ""}. The invoice is still due,
            and your care is not booked until it clears. Try again, or write {doula.firstName}.
          </AlertDescription>
        </Alert>
      ) : null}
      {/* A bank debit that is still clearing is not a failure and not a payment — saying
          either one would be a guess about the family's money. */}
      {!unpaid && pending ? (
        <Alert>
          <AlertDescription>
            Your payment is still clearing with your bank. Nothing more is needed from you —
            this page updates as soon as it lands, and {doula.firstName} can check on it.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Two numbers, in the order a family cares about them. */}
      <section className="grid grid-cols-2 gap-2.5">
        <article className="rounded-xl bg-cloud px-3.5 py-3 ring-1 ring-teal/15">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {copy.totalDueLabel}
          </p>
          <p
            className={cn(
              "mt-1 font-heading text-[26px] font-semibold leading-none tabular-nums",
              groups.outstandingCents > 0 ? "text-coral" : "text-teal-ink",
            )}
          >
            {formatCents(groups.outstandingCents)}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {groups.outstanding.length === 0
              ? "Nothing owed"
              : `${familyInvoiceCount(groups.outstanding.length)} to settle`}
          </p>
        </article>
        <article className="rounded-xl bg-cloud px-3.5 py-3 ring-1 ring-teal/15">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {copy.totalPaidLabel}
          </p>
          <p className="mt-1 font-heading text-[26px] font-semibold leading-none tabular-nums text-teal">
            {formatCents(groups.clearedCents)}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {groups.clearedCents === 0
              ? "No payments yet"
              : `Received by ${doula.firstName}`}
          </p>
        </article>
      </section>

      {/* Outstanding first, opened one at a time — the founder's ask, literally. */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-heading text-[19px] text-teal-ink">{copy.outstandingHeading}</h3>
          {groups.outstanding.length > 0 ? (
            <p className="text-[12.5px] text-muted-foreground">{copy.outstandingHint}</p>
          ) : null}
        </div>
        {groups.outstanding.length === 0 ? (
          <EmptyState title={copy.nothingDue.title} body={copy.nothingDue.body} />
        ) : (
          <div className="space-y-2">
            {groups.outstanding.map((item, index) => (
              <OutstandingCard
                key={item.invoice.id}
                item={item}
                now={now}
                copy={copy}
                open={opensByDefault(groups, index)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-heading text-[19px] text-teal-ink">{copy.historyHeading}</h3>
          {groups.history.length > 0 ? (
            <p className="text-[12.5px] text-muted-foreground">{copy.historyHint}</p>
          ) : null}
        </div>
        {groups.history.length === 0 ? (
          <EmptyState title={copy.noHistory.title} body={copy.noHistory.body} />
        ) : (
          <ul className="overflow-hidden rounded-xl bg-card ring-1 ring-teal/15">
            {groups.history.map((item) => (
              <li
                key={item.invoice.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-teal/10 px-3.5 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-teal-ink">{item.invoice.number}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {item.cleared && item.invoice.paidAt
                      ? `${copy.paidLabel} ${shortDate(item.invoice.paidAt)}`
                      : `${copy.issuedLabel} ${shortDate(item.invoice.issuedAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="font-heading text-[15px] font-semibold tabular-nums text-teal-ink">
                    {formatCents(item.invoice.amountCents, item.invoice.currency)}
                  </span>
                  <StatusChip item={item} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PayHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="max-w-2xl">
      <h2 className="font-heading text-[26px] font-semibold leading-tight tracking-[-0.02em] text-teal-ink">
        {title}
      </h2>
      <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{subtitle}</p>
    </header>
  );
}

/** Never `default`: a Paid-looking chip on an uncleared invoice is the TOK-48 bug itself. */
function StatusChip({ item }: { item: FamilyPayItem }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-semibold",
        item.panel.badge.tone === "coral" ? "bg-coral/12 text-coral" : "bg-teal/12 text-teal",
      )}
    >
      {item.panel.badge.label}
    </span>
  );
}

/**
 * One outstanding invoice, closed until you open it — `<details>` rather than a toggle, so
 * the first one is already open on arrival and the rest work with JavaScript off.
 */
function OutstandingCard({
  item,
  now,
  copy,
  open,
}: {
  item: FamilyPayItem;
  now: Date;
  copy: ReturnType<typeof familyPayCopy>;
  open: boolean;
}) {
  const { invoice, panel } = item;
  const due = dueNote(invoice, now, shortDate);
  const lines = displayLines(invoice);

  return (
    <details
      open={open}
      className={cn(
        "group overflow-hidden rounded-xl bg-card ring-1 transition-colors",
        due.tone === "coral" ? "ring-coral/25" : "ring-teal/15",
      )}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-cloud/70">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-teal-ink">{invoice.number}</p>
          <p
            className={cn(
              "text-[12.5px]",
              due.tone === "coral" ? "font-semibold text-coral" : "text-muted-foreground",
            )}
          >
            {due.text}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="font-heading text-[22px] font-semibold leading-none tabular-nums text-teal-ink">
            {formatCents(invoice.amountCents, invoice.currency)}
          </span>
          <StatusChip item={item} />
        </div>
      </summary>

      <div className="border-t border-teal/12 bg-cloud/50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {copy.detailsLabel}
        </p>
        <ul className="mt-1.5 grid gap-1">
          {lines.map((line) => (
            <li key={line.id} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-teal-ink">
                {line.description}
                {line.quantity > 1 ? (
                  <span className="text-muted-foreground"> × {line.quantity}</span>
                ) : null}
              </span>
              <span className="tabular-nums text-teal-ink">
                {formatCents(line.unitAmountCents * line.quantity, invoice.currency)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {copy.issuedLabel} {shortDate(invoice.issuedAt)}
        </p>

        {panel.body ? <p className="mt-2 text-[13px] text-teal">{panel.body}</p> : null}

        {panel.action === "pay" ? (
          <>
            <form action={payInvoiceAction.bind(null, invoice.id)} className="mt-3">
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-lg bg-teal px-4 text-[13px] font-semibold text-cloud shadow-sm transition-colors hover:bg-teal/90"
              >
                {copy.payLabel}
              </button>
            </form>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              {copy.otherMethods}
            </p>
          </>
        ) : null}
      </div>
    </details>
  );
}
