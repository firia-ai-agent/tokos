"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Eye } from "lucide-react";
import { contrastInk, sanitizeHexColor } from "@/lib/brand";
import { formatCents } from "@/lib/money";
import {
  INVOICE_ACCENTS,
  INVOICE_COPY,
  DEFAULT_PAYMENT_TERM_DAYS,
  dueDateFrom,
  nextInvoiceNumber,
  paymentTermLabel,
} from "@/lib/invoice-dashboard";
import { saveInvoiceTemplateAction } from "@/app/actions/invoices";
import { cn } from "@/lib/utils";

const FIELD_CLASS =
  "h-9 w-full rounded-lg border border-teal/20 bg-card px-2.5 text-[13px] text-teal-ink placeholder:text-muted-foreground focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25";

export type InvoicePreviewSample = {
  number: string;
  familyName: string;
  familyEmail: string;
  lineLabel: string;
  amountCents: number;
  currency: string;
  issuedAt: string;
  dueAt: string;
};

/**
 * Business information on the left, a live invoice on the right (shots 16–18, TOK-55).
 *
 * The fields that save are the practice's own brand row — one name, one site, one phone,
 * one colour — because an invoice going out under a different name to the portal is a
 * bug, not a feature. Typing repaints the preview immediately; the value that reaches the
 * database still goes through `sanitizeBrand` on the server.
 *
 * The accent swatches are Faith's four. The reference offers amber, cornflower and purple;
 * a purple invoice from a birth practice is somebody else's brand.
 */
export function InvoiceTemplateForm({
  defaults,
  sample,
  canEdit,
}: {
  defaults: {
    portalName: string;
    websiteUrl: string;
    onCallPhone: string;
    primaryColor: string;
    footerText: string;
  };
  sample: InvoicePreviewSample;
  canEdit: boolean;
}) {
  const [name, setName] = useState(defaults.portalName);
  const [website, setWebsite] = useState(defaults.websiteUrl);
  const [phone, setPhone] = useState(defaults.onCallPhone);
  const [accent, setAccent] = useState(defaults.primaryColor);

  const resolved = sanitizeHexColor(accent, defaults.primaryColor);
  const ink = contrastInk(resolved);

  return (
    <form action={saveInvoiceTemplateAction} className="grid gap-3.5 lg:grid-cols-[1fr_1fr]">
      <div className="grid gap-3.5 content-start">
        <section className="rounded-xl bg-card p-4 ring-1 ring-teal/15">
          <h3 className="font-heading text-[17px] text-teal-ink">
            {INVOICE_COPY.templates.businessHeading}
          </h3>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Practice name
              </span>
              <input
                name="portalName"
                value={name}
                disabled={!canEdit}
                onChange={(event) => setName(event.target.value)}
                className={FIELD_CLASS}
              />
              <span className="text-[11.5px] text-muted-foreground">
                The name at the top of the invoice and in the portal header.
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Website
                </span>
                <input
                  name="websiteUrl"
                  value={website}
                  disabled={!canEdit}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="novabirth.com"
                  className={FIELD_CLASS}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Phone families can reach
                </span>
                <input
                  name="onCallPhone"
                  value={phone}
                  disabled={!canEdit}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="(555) 010-4477"
                  className={FIELD_CLASS}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-card p-4 ring-1 ring-teal/15">
          <h3 className="font-heading text-[17px] text-teal-ink">
            {INVOICE_COPY.templates.styleHeading}
          </h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Your practice colour, used on the invoice, the portal and every email footer.
          </p>
          <input type="hidden" name="primaryColor" value={resolved} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {INVOICE_ACCENTS.map((option) => {
              const selected = sanitizeHexColor(option.value) === resolved;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setAccent(option.value)}
                  aria-pressed={selected}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold ring-1 transition-colors disabled:opacity-50",
                    selected
                      ? "bg-teal/10 text-teal-ink ring-teal/40"
                      : "text-muted-foreground ring-teal/15 hover:bg-cloud",
                  )}
                >
                  <span className={cn("size-4 rounded-full", option.swatchClass)} aria-hidden />
                  {option.label}
                </button>
              );
            })}
            <span
              className="ml-1 inline-flex h-8 items-center rounded-lg px-2.5 font-mono text-[11.5px] font-semibold uppercase"
              style={{ backgroundColor: resolved, color: ink }}
            >
              {resolved}
            </span>
          </div>
        </section>

        {canEdit ? (
          <button
            type="submit"
            className="inline-flex h-9 w-fit items-center rounded-lg bg-teal px-4 text-[13px] font-semibold text-cloud shadow-sm transition-colors hover:bg-teal/90"
          >
            Save invoice template
          </button>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            Your owner or an admin edits these details in the workspace.
          </p>
        )}
      </div>

      {/* Live preview — the invoice as a family opens it, repainting as you type. */}
      <section className="rounded-xl bg-cloud p-4 ring-1 ring-teal/15">
        <div className="flex items-center gap-1.5">
          <Eye aria-hidden className="size-3.5 text-teal" />
          <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-teal">
            {INVOICE_COPY.templates.previewHeading}
          </h3>
        </div>
        <article className="mt-2.5 overflow-hidden rounded-xl bg-card ring-1 ring-teal/12">
          <header
            className="flex items-start justify-between gap-3 px-4 py-3"
            style={{ backgroundColor: resolved, color: ink }}
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
                Invoice
              </p>
              <p className="font-heading text-[19px] leading-tight">{sample.number}</p>
            </div>
            <div className="text-right">
              <p className="font-heading text-[15px] leading-tight">{name || "Your practice"}</p>
              {website ? <p className="text-[11.5px] opacity-85">{website}</p> : null}
              {phone ? <p className="text-[11.5px] opacity-85">{phone}</p> : null}
            </div>
          </header>
          <div className="grid grid-cols-2 gap-3 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Billed to
              </p>
              <p className="mt-0.5 text-[13px] font-semibold text-teal-ink">
                {sample.familyName}
              </p>
              <p className="text-[11.5px] text-muted-foreground">{sample.familyEmail}</p>
            </div>
            <div className="text-right">
              <p className="text-[11.5px] text-muted-foreground">
                Invoiced <span className="text-teal-ink">{sample.issuedAt}</span>
              </p>
              <p className="text-[11.5px] text-muted-foreground">
                Due <span className="font-semibold text-teal-ink">{sample.dueAt}</span>
              </p>
            </div>
          </div>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-y border-teal/12 bg-cloud/70">
                <th className="px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Care
                </th>
                <th className="px-4 py-1.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-2 text-[13px] text-teal-ink">{sample.lineLabel}</td>
                <td className="px-4 py-2 text-right text-[13px] tabular-nums text-teal-ink">
                  {formatCents(sample.amountCents, sample.currency)}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="flex items-baseline justify-between border-t border-teal/12 px-4 py-2.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Total due
            </span>
            <span className="font-heading text-[20px] font-semibold tabular-nums text-teal-ink">
              {formatCents(sample.amountCents, sample.currency)}
            </span>
          </div>
          <footer className="border-t border-teal/12 bg-cloud/60 px-4 py-2.5">
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              {defaults.footerText}
            </p>
          </footer>
        </article>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          Numbers run {nextInvoiceNumber(0)}, {nextInvoiceNumber(1)}, {nextInvoiceNumber(2)} — and
          a new invoice is {paymentTermLabel(DEFAULT_PAYMENT_TERM_DAYS).toLowerCase()}, which puts
          this one on {format(dueDateFrom(new Date()), "MMM d")}.
        </p>
      </section>
    </form>
  );
}
