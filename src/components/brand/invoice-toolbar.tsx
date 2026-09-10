"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Download, ListFilter, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import {
  DUE_FILTERS,
  INVOICE_COPY,
  ISSUED_FILTERS,
  PAYMENT_TERMS,
  STATUS_FILTERS,
  TYPE_FILTERS,
  DEFAULT_PAYMENT_TERM_DAYS,
  hasActiveFilters,
  type FilterOption,
  type InvoiceFilters,
} from "@/lib/invoice-dashboard";
import { createInvoiceAction } from "@/app/actions/invoices";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "h-8 rounded-lg border border-teal/20 bg-card pl-7 pr-2 text-[12.5px] font-semibold text-teal-ink transition-colors hover:border-teal/40 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25";

const FIELD_CLASS =
  "h-9 w-full rounded-lg border border-teal/20 bg-card px-2.5 text-[13px] text-teal-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25";

/** A filter is set when it is not on its "any" option — the chip goes Teal to say so. */
function FilterSelect({
  name,
  value,
  options,
  icon: Icon,
  onChange,
}: {
  name: string;
  value: string;
  options: readonly FilterOption[];
  icon: typeof ListFilter;
  onChange: (name: string, value: string) => void;
}) {
  const active = value !== "all";
  return (
    <div className="relative">
      <Icon
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2",
          active ? "text-teal" : "text-muted-foreground",
        )}
      />
      <select
        name={name}
        aria-label={options[0].label}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        className={cn(SELECT_CLASS, active && "border-teal/45 bg-teal/8 text-teal")}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Filters, search, Export and New invoice — the row from shot 13, wired (TOK-55).
 *
 * Filters live in the URL rather than in component state: a filtered ledger is something
 * a doula sends to her admin, and reloading the page must not silently widen it. Export
 * downloads exactly the rows the table is showing — the CSV is built on the server from
 * the same filtered list, so "Export" can never mean a different set than the screen.
 */
export function InvoiceToolbar({
  filters,
  csv,
  filename,
  rowCount,
  families,
}: {
  filters: InvoiceFilters;
  csv: string;
  filename: string;
  rowCount: number;
  families: readonly { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.q);
  const [creating, setCreating] = useState(false);

  const push = (next: URLSearchParams) => {
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(name);
    else next.set(name, value);
    push(next);
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setParam("q", query.trim());
  };

  const clearAll = () => {
    setQuery("");
    push(new URLSearchParams());
  };

  const dirty = hasActiveFilters(filters);

  const download = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("space-y-2.5", pending && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          name="status"
          value={filters.status}
          options={STATUS_FILTERS}
          icon={SlidersHorizontal}
          onChange={setParam}
        />
        <FilterSelect
          name="due"
          value={filters.due}
          options={DUE_FILTERS}
          icon={CalendarDays}
          onChange={setParam}
        />
        <FilterSelect
          name="issued"
          value={filters.issued}
          options={ISSUED_FILTERS}
          icon={CalendarDays}
          onChange={setParam}
        />
        <FilterSelect
          name="type"
          value={filters.type}
          options={TYPE_FILTERS}
          icon={ListFilter}
          onChange={setParam}
        />
        {dirty ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] font-semibold text-coral hover:bg-coral/10"
          >
            <X aria-hidden className="size-3.5" />
            {INVOICE_COPY.toolbar.clear}
          </button>
        ) : null}

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <form onSubmit={submitSearch} className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={INVOICE_COPY.toolbar.searchPlaceholder}
              aria-label={INVOICE_COPY.toolbar.searchLabel}
              className="h-8 w-[16rem] rounded-lg border border-teal/20 bg-card pl-8 pr-2 text-[12.5px] text-teal-ink placeholder:text-muted-foreground focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25"
            />
          </form>
          <button
            type="button"
            onClick={download}
            disabled={rowCount === 0}
            title={INVOICE_COPY.toolbar.exportHint}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-teal/20 bg-card px-2.5 text-[12.5px] font-semibold text-teal-ink transition-colors hover:bg-teal/10 disabled:opacity-40"
          >
            <Download aria-hidden className="size-3.5" />
            {INVOICE_COPY.toolbar.export}
          </button>
          <button
            type="button"
            onClick={() => setCreating((open) => !open)}
            aria-expanded={creating}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal px-3 text-[12.5px] font-semibold text-cloud shadow-sm transition-colors hover:bg-teal/90"
          >
            <Plus aria-hidden className="size-3.5" />
            {INVOICE_COPY.toolbar.newInvoice}
          </button>
        </div>
      </div>

      {creating ? (
        <form
          action={createInvoiceAction}
          className="rounded-xl bg-cloud p-4 ring-1 ring-teal/15"
          aria-label={INVOICE_COPY.newInvoice.heading}
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-heading text-[17px] text-teal-ink">
              {INVOICE_COPY.newInvoice.heading}
            </h2>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-[12px] font-semibold text-muted-foreground hover:text-teal-ink"
            >
              Close
            </button>
          </div>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
            {INVOICE_COPY.newInvoice.blurb}
          </p>
          {families.length === 0 ? (
            <p className="mt-3 text-[13px] font-semibold text-coral">
              {INVOICE_COPY.newInvoice.noFamilies}
            </p>
          ) : (
            <>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {INVOICE_COPY.newInvoice.family}
                  </span>
                  <select name="clientId" required className={FIELD_CLASS} defaultValue="">
                    <option value="" disabled>
                      Choose a family
                    </option>
                    {families.map((family) => (
                      <option key={family.id} value={family.id}>
                        {family.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {INVOICE_COPY.newInvoice.amount}
                  </span>
                  <input
                    name="amount"
                    required
                    inputMode="decimal"
                    placeholder="1200"
                    className={FIELD_CLASS}
                  />
                  <span className="text-[11.5px] text-muted-foreground">
                    {INVOICE_COPY.newInvoice.amountHint}
                  </span>
                </label>
                <label className="grid gap-1">
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {INVOICE_COPY.newInvoice.terms}
                  </span>
                  <select
                    name="termDays"
                    className={FIELD_CLASS}
                    defaultValue={String(DEFAULT_PAYMENT_TERM_DAYS)}
                  >
                    {PAYMENT_TERMS.map((term) => (
                      <option key={term.value} value={term.days}>
                        {term.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="mt-3 grid gap-1">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {INVOICE_COPY.newInvoice.description}
                </span>
                <input
                  name="description"
                  placeholder="Postpartum visit — 4 hours"
                  className={FIELD_CLASS}
                />
                <span className="text-[11.5px] text-muted-foreground">
                  {INVOICE_COPY.newInvoice.descriptionHint}
                </span>
              </label>
              <button
                type="submit"
                className="mt-3 inline-flex h-9 items-center rounded-lg bg-teal px-3.5 text-[13px] font-semibold text-cloud shadow-sm transition-colors hover:bg-teal/90"
              >
                {INVOICE_COPY.newInvoice.submit}
              </button>
            </>
          )}
        </form>
      ) : null}
    </div>
  );
}
