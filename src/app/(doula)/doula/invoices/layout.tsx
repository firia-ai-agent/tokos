import { INVOICE_COPY } from "@/lib/invoice-dashboard";
import { InvoiceTabs } from "@/components/brand/invoice-tabs";

export const dynamic = "force-dynamic";

/**
 * One header over all four invoicing tabs (TOK-55): the title stays put and only the
 * panel under it changes, which is what makes the four routes read as one product rather
 * than four pages that happen to be about money.
 */
export default function InvoicesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <header className="space-y-2.5">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal">
            {INVOICE_COPY.eyebrow}
          </p>
          <h1 className="mt-1 font-heading text-[28px] font-semibold leading-tight tracking-[-0.02em] text-teal-ink">
            {INVOICE_COPY.title}
          </h1>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
            {INVOICE_COPY.subtitle}
          </p>
        </div>
        <InvoiceTabs />
      </header>
      {children}
    </div>
  );
}
