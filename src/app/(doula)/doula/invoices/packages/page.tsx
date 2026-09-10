import { requireStaff } from "@/lib/tenancy";
import { invoiceDashboardRows, practicePackages } from "@/lib/queries";
import { formatCents } from "@/lib/money";
import {
  INVOICE_COPY,
  familyCountLabel,
  packageRollups,
} from "@/lib/invoice-dashboard";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The practice's own catalogue (TOK-55).
 *
 * The reference dashboard's Items tab is a typed-in product list — "TT Shop Management",
 * $30,000. Tokos already knows what this practice sells and at what price, because every
 * engagement carries the package a family was actually offered. So this tab is a read of
 * real work rather than a second price list to keep in sync, and it can never advertise a
 * package nobody has ever been given.
 */
export default async function InvoicePackagesPage() {
  const staff = await requireStaff();
  const now = new Date();
  const [engagements, invoices] = await Promise.all([
    practicePackages(staff.organizationId),
    invoiceDashboardRows(staff.organizationId),
  ]);
  const packages = packageRollups(engagements, invoices, now);

  return (
    <div className="space-y-3.5">
      <div className="max-w-xl">
        <h2 className="font-heading text-[19px] text-teal-ink">{INVOICE_COPY.packages.title}</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {INVOICE_COPY.packages.subtitle}
        </p>
      </div>

      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-teal/15">
        {packages.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <h3 className="font-heading text-xl text-teal-ink">
              {INVOICE_COPY.packages.empty.title}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {INVOICE_COPY.packages.empty.body}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-left">
              <thead>
                <tr className="bg-cloud">
                  {INVOICE_COPY.packages.columns.map((column) => (
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
                {packages.map((pkg) => (
                  <tr
                    key={pkg.label}
                    className="border-t border-teal/10 transition-colors hover:bg-cloud/70"
                  >
                    <td className="px-3 py-2.5">
                      <p className="text-[13px] font-semibold text-teal-ink">{pkg.label}</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {pkg.activeCount > 0
                          ? `${pkg.activeCount} open ${pkg.activeCount === 1 ? "engagement" : "engagements"}`
                          : "No open engagements"}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] tabular-nums text-muted-foreground">
                      {familyCountLabel(pkg.familyCount)}
                    </td>
                    <td className="px-3 py-2.5 font-heading text-[14px] font-semibold tabular-nums text-teal-ink">
                      {pkg.lowCents === pkg.highCents
                        ? formatCents(pkg.lowCents, pkg.currency)
                        : `${formatCents(pkg.lowCents, pkg.currency)} – ${formatCents(pkg.highCents, pkg.currency)}`}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] font-semibold tabular-nums text-teal">
                      {formatCents(pkg.billedCents, pkg.currency)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-[13px] font-semibold tabular-nums",
                        pkg.outstandingCents > 0 ? "text-coral" : "text-muted-foreground",
                      )}
                    >
                      {formatCents(pkg.outstandingCents, pkg.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="border-t border-teal/12 bg-cloud/60 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
          Prices are what families were actually charged — edit one on her engagement, not here.
        </footer>
      </section>
    </div>
  );
}
