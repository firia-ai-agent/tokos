import Link from "next/link";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { requireStaff } from "@/lib/tenancy";
import { canManageTeam } from "@/lib/team";
import { invoiceDashboardRows } from "@/lib/queries";
import { DEFAULT_PRIMARY_COLOR } from "@/lib/brand";
import { DEFAULT_PORTAL_NAME } from "@/lib/client-brand";
import {
  DEFAULT_PAYMENT_TERM_DAYS,
  INVOICE_COPY,
  INVOICE_REMINDERS,
  PAYMENT_METHODS,
  dueDateFrom,
  invoiceNotice,
  invoiceNumberPrefix,
  nextInvoiceNumber,
  paymentTermLabel,
} from "@/lib/invoice-dashboard";
import { InvoiceTemplateForm } from "@/components/brand/invoice-template-form";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Strip the footer's inline HTML down to the sentence it says, for the preview. */
function footerText(html: string | null): string {
  const text = (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text || "Thank you for trusting us with your birth.";
}

export default async function InvoiceTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; number?: string }>;
}) {
  const staff = await requireStaff();
  const query = await searchParams;
  const db = getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, staff.organizationId))
    .limit(1);

  // The preview bills a real family when there is one, so a doula is looking at her own
  // invoice rather than at "Alex Thompson" and a $4,500 website redesign.
  const rows = await invoiceDashboardRows(staff.organizationId);
  const newest = [...rows].sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())[0];
  const issuedAt = newest?.issuedAt ?? new Date();

  // This practice's own numbering, not the seed's: a second agency reading "NOVA-…" here
  // is being shown someone else's letters on its own invoices (TOK-62).
  const issued = rows.map((row) => row.number);
  const upcomingNumber = nextInvoiceNumber(issued, invoiceNumberPrefix(org ?? null));
  const numberPrefix = invoiceNumberPrefix(org ?? null);

  const notice = invoiceNotice(query);

  return (
    <div className="space-y-3.5">
      <div className="max-w-xl">
        <h2 className="font-heading text-[19px] text-teal-ink">{INVOICE_COPY.templates.title}</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {INVOICE_COPY.templates.subtitle}
        </p>
      </div>

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

      <InvoiceTemplateForm
        canEdit={canManageTeam(staff.membershipRole)}
        defaults={{
          portalName: org?.portalName ?? DEFAULT_PORTAL_NAME,
          websiteUrl: org?.websiteUrl ?? "",
          onCallPhone: org?.onCallPhone ?? "",
          primaryColor: org?.primaryColor ?? DEFAULT_PRIMARY_COLOR,
          footerText: footerText(org?.footerHtml ?? null),
        }}
        upcomingNumber={upcomingNumber}
        sample={{
          number: newest?.number ?? upcomingNumber,
          familyName: newest?.familyName ?? "Jordan Blake",
          familyEmail: newest?.familyEmail ?? "jordan@example.com",
          lineLabel: newest?.packageLabel ?? "Birth doula care",
          amountCents: newest?.amountCents ?? 180000,
          currency: newest?.currency ?? "usd",
          issuedAt: format(issuedAt, "MMM d, yyyy"),
          dueAt: format(newest?.dueAt ?? dueDateFrom(issuedAt), "MMM d, yyyy"),
        }}
      />

      {/* What Tokos does on its own. Everything here is a statement about live behaviour —
          a toggle that switches nothing off is the same dead chrome as a button that goes
          nowhere, so a rung that is not scheduled yet says so rather than pretending. */}
      <section className="grid gap-3.5 lg:grid-cols-3">
        <article className="rounded-xl bg-card p-4 ring-1 ring-teal/15">
          <h3 className="font-heading text-[17px] text-teal-ink">
            {INVOICE_COPY.templates.numberingHeading}
          </h3>
          <p className="mt-2 font-mono text-[13px] font-semibold uppercase text-teal">
            {numberPrefix}-…
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            The next one is {upcomingNumber}, and they carry on upward in the order they are
            raised. The prefix follows the ledger you already have, so nothing you have sent
            is orphaned.
          </p>
        </article>

        <article className="rounded-xl bg-card p-4 ring-1 ring-teal/15">
          <h3 className="font-heading text-[17px] text-teal-ink">
            {INVOICE_COPY.templates.paymentHeading}
          </h3>
          <p className="mt-2 text-[12.5px] font-semibold text-teal-ink">
            {paymentTermLabel(DEFAULT_PAYMENT_TERM_DAYS)}
          </p>
          <ul className="mt-2 grid gap-1.5">
            {PAYMENT_METHODS.map((method) => (
              <li key={method.key} className="text-[12.5px] leading-snug">
                <span className="font-semibold text-teal-ink">{method.label}</span>
                <span className="text-muted-foreground"> — {method.note}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
            Bank debit is not connected, so no family is offered one she cannot use.
          </p>
        </article>

        <article className="rounded-xl bg-card p-4 ring-1 ring-teal/15">
          <h3 className="font-heading text-[17px] text-teal-ink">
            {INVOICE_COPY.templates.remindersHeading}
          </h3>
          <ul className="mt-2 grid gap-2">
            {INVOICE_REMINDERS.map((reminder) => (
              <li key={reminder.key} className="text-[12.5px] leading-snug">
                <span
                  className={cn(
                    "mr-1.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]",
                    reminder.live ? "bg-teal/12 text-teal" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {reminder.live ? "On" : "Not yet"}
                </span>
                <span className="font-semibold text-teal-ink">{reminder.label}</span>
                <span className="block text-muted-foreground">{reminder.note}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {INVOICE_COPY.templates.defaultsNote} The wording at the bottom of an invoice and of
        every email is your{" "}
        <Link href="/doula/settings" className="font-semibold text-teal hover:underline">
          workspace footer
        </Link>
        , kept in one place so it cannot say two different things.
      </p>
    </div>
  );
}
