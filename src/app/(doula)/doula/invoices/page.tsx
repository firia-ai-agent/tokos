import Link from "next/link";
import { format } from "date-fns";
import { requireStaff } from "@/lib/tenancy";
import { billableFamilies, invoiceDashboardRows } from "@/lib/queries";
import { formatCents } from "@/lib/money";
import {
  INVOICE_COPY,
  INVOICE_NOTICES,
  filterInvoices,
  invoiceCleared,
  invoiceCsvFilename,
  invoiceSummary,
  invoiceTypeLabel,
  invoicesToCsv,
  isOverdue,
  pageCount,
  pageSlice,
  readFilters,
  readPage,
  showingLabel,
  sortInvoices,
  staffInvoiceStatus,
  type InvoiceRecord,
} from "@/lib/invoice-dashboard";
import { InvoiceToolbar } from "@/components/brand/invoice-toolbar";
import { InvoiceRowActions } from "@/components/brand/invoice-row-actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TONE_TEXT = {
  ink: "text-teal-ink",
  teal: "text-teal",
  coral: "text-coral",
} as const;

const BADGE_TONE = {
  ink: "bg-secondary text-teal-ink",
  teal: "bg-teal/12 text-teal",
  coral: "bg-coral/12 text-coral",
} as const;

function dateLabel(value: Date | null) {
  return value ? format(value, "MMM d, yyyy") : "—";
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const query = await searchParams;
  const [rows, families] = await Promise.all([
    invoiceDashboardRows(staff.organizationId),
    billableFamilies(staff.organizationId),
  ]);

  const now = new Date();
  const filters = readFilters(query);
  // The KPI strip counts the practice, not the filter: a doula who has narrowed the table
  // to one family still needs to see what the whole ledger is owed.
  const kpis = invoiceSummary(rows, now);
  const filtered = sortInvoices(filterInvoices(rows, filters, now), now);
  const page = readPage(query.page, filtered.length);
  const visible = pageSlice(filtered, page);
  const pages = pageCount(filtered.length);

  const notice =
    INVOICE_NOTICES[String(query.error ?? "")] ?? INVOICE_NOTICES[String(query.saved ?? "")];

  const pageHref = (next: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === "page" || value == null) continue;
      params.set(key, Array.isArray(value) ? (value[0] ?? "") : value);
    }
    if (next > 1) params.set("page", String(next));
    const search = params.toString();
    return search ? `/doula/invoices?${search}` : "/doula/invoices";
  };

  return (
    <div className="space-y-3.5">
      {notice ? (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-sm ring-1",
            notice.tone === "coral"
              ? "bg-coral/10 text-coral ring-coral/20"
              : "bg-teal/10 text-teal-ink ring-teal/20",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      {/* KPI strip — Cloud cards on the white page, money in Fraunces, count badge at the
          top right exactly as the reference sets it out. Paid is `isPaymentCleared`. */}
      <section className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <article key={kpi.key} className="rounded-xl bg-cloud px-3.5 py-3 ring-1 ring-teal/15">
            <div className="flex items-start justify-between gap-2">
              <p
                className={cn(
                  "font-heading text-[26px] font-semibold leading-none tracking-[-0.01em] tabular-nums",
                  TONE_TEXT[kpi.tone],
                )}
              >
                {kpi.value}
              </p>
              <span className="shrink-0 rounded-md bg-card px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground ring-1 ring-teal/12">
                {kpi.badge}
              </span>
            </div>
            <p className="mt-2 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-teal-ink">
              {kpi.label}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{kpi.hint}</p>
          </article>
        ))}
      </section>

      <InvoiceToolbar
        filters={filters}
        csv={invoicesToCsv(filtered, now)}
        filename={invoiceCsvFilename(now)}
        rowCount={filtered.length}
        families={families}
      />

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-teal/15">
        {visible.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <h2 className="font-heading text-xl text-teal-ink">
              {rows.length === 0 ? INVOICE_COPY.empty.title : INVOICE_COPY.filteredEmpty.title}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {rows.length === 0 ? INVOICE_COPY.empty.body : INVOICE_COPY.filteredEmpty.body}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <thead>
                <tr className="bg-cloud">
                  {INVOICE_COPY.table.columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                    >
                      {column}
                    </th>
                  ))}
                  <th scope="col" className="w-10 px-3 py-2">
                    <span className="sr-only">{INVOICE_COPY.table.rowActions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} now={now} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-teal/12 bg-cloud/60 px-3.5 py-2.5">
          <p className="text-[12.5px] text-muted-foreground">
            {showingLabel(page, filtered.length)}
          </p>
          {pages > 1 ? (
            <nav className="flex items-center gap-1.5" aria-label="Pages">
              <PageLink href={pageHref(page - 1)} disabled={page === 1} label="Previous" />
              <span className="text-[12.5px] font-semibold tabular-nums text-teal-ink">
                {page} / {pages}
              </span>
              <PageLink href={pageHref(page + 1)} disabled={page === pages} label="Next" />
            </nav>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <span className="rounded-md px-2 py-1 text-[12.5px] font-semibold text-muted-foreground/50">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-md px-2 py-1 text-[12.5px] font-semibold text-teal-ink hover:bg-teal/10"
    >
      {label}
    </Link>
  );
}

/**
 * One dense row. Terracotta down the left edge means late — the same signal the pipeline
 * card uses, so "needs you today" reads the same everywhere in the product.
 */
function InvoiceRow({ invoice, now }: { invoice: InvoiceRecord; now: Date }) {
  const status = staffInvoiceStatus(invoice, now);
  const late = isOverdue(invoice, now);
  const amount = formatCents(invoice.amountCents, invoice.currency);
  return (
    <tr
      className={cn(
        "border-t border-teal/10 align-middle transition-colors hover:bg-cloud/70",
        late && "bg-coral/[0.04]",
      )}
    >
      <td className="px-3 py-2.5">
        <span
          className={cn(
            "inline-flex items-center gap-2 text-[13px] font-semibold text-teal-ink",
            late && "before:h-4 before:w-[3px] before:rounded-full before:bg-coral",
          )}
        >
          {invoice.number}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className="rounded-md bg-secondary px-2 py-0.5 text-[11.5px] font-semibold text-teal-ink">
          {invoiceTypeLabel(invoice)}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <Link
          href={`/doula/clients/${invoice.clientId}`}
          className="text-[13px] font-medium text-teal-ink hover:text-teal hover:underline"
        >
          {invoice.familyName}
        </Link>
        {invoice.packageLabel ? (
          <p className="truncate text-[11.5px] text-muted-foreground">{invoice.packageLabel}</p>
        ) : null}
      </td>
      <td className="px-3 py-2.5 font-heading text-[14px] font-semibold tabular-nums text-teal-ink">
        {amount}
      </td>
      <td className="px-3 py-2.5">
        <span
          className={cn(
            "inline-flex rounded-md px-2 py-0.5 text-[11.5px] font-semibold",
            BADGE_TONE[status.tone],
          )}
        >
          {status.label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-[12.5px] tabular-nums text-muted-foreground">
        {dateLabel(invoice.issuedAt)}
      </td>
      <td
        className={cn(
          "px-3 py-2.5 text-[12.5px] tabular-nums",
          late ? "font-semibold text-coral" : "text-muted-foreground",
        )}
      >
        {dateLabel(invoice.dueAt)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <InvoiceRowActions
          invoiceId={invoice.id}
          invoiceNumber={invoice.number}
          familyId={invoice.clientId}
          familyName={invoice.familyName}
          amountLabel={amount}
          canRecordPayment={!invoiceCleared(invoice) && status.label !== "Cancelled" && status.label !== "Refunded"}
        />
      </td>
    </tr>
  );
}
