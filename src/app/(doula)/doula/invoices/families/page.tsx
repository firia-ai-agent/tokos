import Link from "next/link";
import { format } from "date-fns";
import { requireStaff } from "@/lib/tenancy";
import { invoiceDashboardRows } from "@/lib/queries";
import { formatCents } from "@/lib/money";
import {
  INVOICE_COPY,
  familyCountLabel,
  familyRollups,
  invoiceCountLabel,
  invoiceMatchesSearch,
} from "@/lib/invoice-dashboard";
import { InvoiceSearch } from "@/components/brand/invoice-search";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * "Who you bill" (TOK-55).
 *
 * The reference dashboard calls this tab Buyers and gives it a Company name column. The
 * people this practice bills are families having babies; there is no company, and calling
 * Jordan a buyer is the same category error as calling her a lead. Same table, told true.
 */
export default async function InvoiceFamiliesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const query = await searchParams;
  const raw = query.q;
  const search = String((Array.isArray(raw) ? raw[0] : raw) ?? "").trim();

  const now = new Date();
  const rows = await invoiceDashboardRows(staff.organizationId);
  const matched = search ? rows.filter((row) => invoiceMatchesSearch(row, search)) : rows;
  const families = familyRollups(matched, now);

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="font-heading text-[19px] text-teal-ink">
            {INVOICE_COPY.families.title}
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {INVOICE_COPY.families.subtitle}
          </p>
        </div>
        <InvoiceSearch
          placeholder={INVOICE_COPY.families.searchPlaceholder}
          defaultValue={search}
        />
      </div>

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-teal/15">
        {families.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <h3 className="font-heading text-xl text-teal-ink">
              {INVOICE_COPY.families.empty.title}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {INVOICE_COPY.families.empty.body}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-left">
              <thead>
                <tr className="bg-cloud">
                  {INVOICE_COPY.families.columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {families.map((family) => (
                  <tr
                    key={family.clientId}
                    className={cn(
                      "border-t border-teal/10 transition-colors hover:bg-cloud/70",
                      family.overdueCents > 0 && "bg-coral/[0.04]",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal/12 text-[11.5px] font-semibold text-teal">
                          {family.initials}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/doula/clients/${family.clientId}`}
                            className="block truncate text-[13px] font-semibold text-teal-ink hover:text-teal hover:underline"
                          >
                            {family.name}
                          </Link>
                          <p className="truncate text-[11.5px] text-muted-foreground">
                            {family.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] tabular-nums text-muted-foreground">
                      {invoiceCountLabel(family.invoiceCount)}
                    </td>
                    <td className="px-3 py-2.5 font-heading text-[14px] font-semibold tabular-nums text-teal-ink">
                      {formatCents(family.billedCents)}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] font-semibold tabular-nums text-teal">
                      {formatCents(family.paidCents)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-[13px] font-semibold tabular-nums",
                        family.outstandingCents > 0 ? "text-coral" : "text-muted-foreground",
                      )}
                    >
                      {formatCents(family.outstandingCents)}
                      {family.overdueCents > 0 ? (
                        <span className="ml-1.5 rounded-md bg-coral/12 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-coral">
                          {formatCents(family.overdueCents)} late
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] tabular-nums text-muted-foreground">
                      {family.lastInvoiceAt ? (
                        <>
                          {format(family.lastInvoiceAt, "MMM d, yyyy")}
                          <span className="ml-1.5 text-[11.5px]">
                            {family.lastInvoiceNumber}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="border-t border-teal/12 bg-cloud/60 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
          {familyCountLabel(families.length)} billed
        </footer>
      </section>
    </div>
  );
}
