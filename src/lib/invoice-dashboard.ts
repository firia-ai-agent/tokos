/**
 * The invoicing surface, as configuration (TOK-55).
 *
 * Every string a doula reads on `/doula/invoices` — tab, KPI label, column header, filter
 * option, empty state — is declared once here and rendered from the declaration. The
 * reference dashboard the founder pointed at is an agency billing product ("Buyers",
 * "Items", a catalog of SaaS retainers); Tokos bills families for care packages, and the
 * vocabulary has to say so. Keeping the copy in one module is what stops "Buyer" leaking
 * back into a table header six edits from now.
 *
 * The money rules live here too, and they all route through `isPaymentCleared` (TOK-48):
 * a Paid total, a Paid badge and a Paid row can never disagree, because there is one
 * function that decides whether money landed.
 */

import { isPaymentCleared } from "@/lib/payment";
import { formatCents } from "@/lib/money";

/* ------------------------------------------------------------------ shape */

/**
 * One invoice as the dashboard needs it: the invoice row, the payment row that rides
 * along with its contract, and the family it belongs to. Deliberately flat and free of
 * Drizzle types so every helper below is testable without a database.
 */
export type InvoiceRecord = {
  id: string;
  number: string;
  clientId: string;
  familyName: string;
  familyEmail: string;
  contractId: string | null;
  engagementId: string | null;
  packageLabel: string | null;
  /** `invoices.status` — the operational code, never rendered raw. */
  status: string;
  /** `payment_statuses.status` for the invoice's contract, when there is one. */
  paymentStatus: string | null;
  amountCents: number;
  currency: string;
  issuedAt: Date;
  dueAt: Date | null;
  paidAt: Date | null;
};

/* ------------------------------------------------------- money state rules */

/**
 * Where one invoice sits, once. Four states, and every total, badge and filter below
 * reads this rather than re-deriving it from a status string:
 *
 * - `paid` — money cleared, and only `isPaymentCleared` may say so.
 * - `overdue` — still owed, and the due date has passed.
 * - `outstanding` — still owed, not yet late.
 * - `closed` — refunded, cancelled or voided. Nobody owes anything, and it is not revenue.
 */
export type InvoiceMoneyState = "paid" | "overdue" | "outstanding" | "closed";

/** Codes that end a bill without money moving. A closed invoice is never "outstanding". */
const CLOSED_STATUSES = new Set(["refunded", "canceled", "cancelled", "void", "voided"]);

export function invoiceCleared(row: Pick<InvoiceRecord, "status" | "paymentStatus">): boolean {
  return isPaymentCleared({ invoiceStatus: row.status, paymentStatus: row.paymentStatus });
}

/**
 * A closed bill is read from whichever row closed it. The payment row wins when the two
 * disagree, for the same reason it wins on the family's pay page: it is the one that
 * touched the money.
 */
function invoiceClosed(row: Pick<InvoiceRecord, "status" | "paymentStatus">): boolean {
  if (row.paymentStatus && CLOSED_STATUSES.has(row.paymentStatus)) return true;
  return CLOSED_STATUSES.has(row.status);
}

/**
 * Late means past the due date and still owed. A cleared invoice cannot be overdue, and
 * neither can a cancelled one — the only thing overdue measures is money the practice is
 * still waiting for.
 */
export function isOverdue(
  row: Pick<InvoiceRecord, "status" | "paymentStatus" | "dueAt">,
  now: Date,
): boolean {
  if (!row.dueAt) return false;
  if (invoiceCleared(row) || invoiceClosed(row)) return false;
  return row.dueAt.getTime() < now.getTime();
}

export function invoiceMoneyState(
  row: Pick<InvoiceRecord, "status" | "paymentStatus" | "dueAt">,
  now: Date,
): InvoiceMoneyState {
  if (invoiceCleared(row)) return "paid";
  if (invoiceClosed(row)) return "closed";
  return isOverdue(row, now) ? "overdue" : "outstanding";
}

/** Days late, for the row that needs to say how late. Zero when the invoice is not late. */
export function daysOverdue(
  row: Pick<InvoiceRecord, "status" | "paymentStatus" | "dueAt">,
  now: Date,
): number {
  if (!isOverdue(row, now) || !row.dueAt) return 0;
  const ms = now.getTime() - row.dueAt.getTime();
  return Math.max(1, Math.floor(ms / 86_400_000));
}

/* --------------------------------------------------------------- KPI strip */

export type InvoiceKpiKey = "total" | "paid" | "outstanding" | "overdue";
export type KpiTone = "ink" | "teal" | "coral";

export type InvoiceKpi = {
  key: InvoiceKpiKey;
  label: string;
  /** Formatted money — Fraunces, tabular, the biggest thing in the card. */
  value: string;
  amountCents: number;
  count: number;
  /** The count badge in the shot's top-right corner: "3 invoices". */
  badge: string;
  hint: string;
  tone: KpiTone;
};

const KPI_LABELS: Record<InvoiceKpiKey, string> = {
  total: "Total invoiced",
  paid: "Paid",
  outstanding: "Outstanding",
  overdue: "Overdue",
};

const KPI_QUIET_HINTS: Record<InvoiceKpiKey, string> = {
  total: "Nothing billed yet",
  paid: "No cleared payments yet",
  outstanding: "Every invoice is settled",
  overdue: "Nothing is late",
};

/** "1 invoice" / "4 invoices" — the badge copy, in one place so it cannot drift. */
export function invoiceCountLabel(count: number): string {
  return `${count} ${count === 1 ? "invoice" : "invoices"}`;
}

export function familyCountLabel(count: number): string {
  return `${count} ${count === 1 ? "family" : "families"}`;
}

/**
 * The four cards across the top of the Invoicing tab.
 *
 * `total` is what the practice actually billed, so cancelled and refunded invoices are
 * out of it — the reference shot shows two cancelled invoices over a $0.00 total, and it
 * is right to: money that was called back was never revenue. Paid is `isPaymentCleared`
 * and nothing else, which is the whole of TOK-48 on this page.
 */
export function invoiceSummary(rows: readonly InvoiceRecord[], now: Date): InvoiceKpi[] {
  const bucket: Record<InvoiceKpiKey, { cents: number; count: number }> = {
    total: { cents: 0, count: 0 },
    paid: { cents: 0, count: 0 },
    outstanding: { cents: 0, count: 0 },
    overdue: { cents: 0, count: 0 },
  };
  const add = (key: InvoiceKpiKey, cents: number) => {
    bucket[key].cents += cents;
    bucket[key].count += 1;
  };

  for (const row of rows) {
    const state = invoiceMoneyState(row, now);
    if (state === "closed") continue;
    add("total", row.amountCents);
    if (state === "paid") add("paid", row.amountCents);
    // Overdue is a slice of what is still owed, not a fifth bucket beside it: a late
    // invoice is money the practice is still waiting for, and both cards say so.
    if (state === "outstanding" || state === "overdue") add("outstanding", row.amountCents);
    if (state === "overdue") add("overdue", row.amountCents);
  }

  const currency = rows[0]?.currency ?? "usd";
  const kpi = (key: InvoiceKpiKey, hint: string, tone: KpiTone): InvoiceKpi => ({
    key,
    label: KPI_LABELS[key],
    value: formatCents(bucket[key].cents, currency),
    amountCents: bucket[key].cents,
    count: bucket[key].count,
    badge: invoiceCountLabel(bucket[key].count),
    hint: bucket[key].count === 0 ? KPI_QUIET_HINTS[key] : hint,
    tone: bucket[key].count === 0 ? "ink" : tone,
  });

  return [
    kpi("total", "Billed across every open and settled invoice", "ink"),
    kpi("paid", "Cleared — refunds and failures are not counted", "teal"),
    kpi("outstanding", "Still owed, including anything late", "coral"),
    kpi(
      "overdue",
      `Past the due date${bucket.overdue.count > 0 ? " — worth a note today" : ""}`,
      "coral",
    ),
  ];
}

/* ------------------------------------------------------------ status voice */

export type StaffInvoiceStatus = { label: string; tone: KpiTone };

/**
 * The badge a doula reads in the table. Staff keep the operational codes everywhere they
 * matter — the DB, the audit log — but a table cell is a sentence, not a column dump, and
 * "voided" is not a word anyone says out loud.
 *
 * Paid is gated on `invoiceCleared`, so a row whose `invoices.status` says `paid` while
 * the payment row says `failed` reads Payment failed. That drift is exactly the bug the
 * family view had (TOK-48); the staff view must not reintroduce it.
 */
export function staffInvoiceStatus(
  row: Pick<InvoiceRecord, "status" | "paymentStatus" | "dueAt">,
  now: Date,
): StaffInvoiceStatus {
  const state = invoiceMoneyState(row, now);
  if (state === "paid") return { label: "Paid", tone: "teal" };
  if (state === "overdue") {
    const days = daysOverdue(row, now);
    return { label: days === 1 ? "Overdue by 1 day" : `Overdue by ${days} days`, tone: "coral" };
  }
  if (state === "closed") {
    const code = row.paymentStatus && CLOSED_STATUSES.has(row.paymentStatus)
      ? row.paymentStatus
      : row.status;
    if (code === "refunded") return { label: "Refunded", tone: "ink" };
    return { label: "Cancelled", tone: "ink" };
  }
  // Still owed. A declined card leaves the bill open on purpose, so the row has to say
  // which kind of open it is — "Due" and "Payment failed" ask for different follow-ups.
  //
  // An invoice row still reading `paid` here means the two tables have drifted, and the
  // payment row is the one that touched the money — the same read `invoicePayPanel` does
  // for the family, so staff and family never see two different answers (TOK-48).
  const code =
    row.paymentStatus && (row.status === "open" || row.status === "paid")
      ? row.paymentStatus
      : row.status;
  if (code === "failed") return { label: "Payment failed", tone: "coral" };
  if (code === "pending") return { label: "Clearing", tone: "ink" };
  return { label: "Due", tone: "coral" };
}

/* -------------------------------------------------------------- invoice type */

export type InvoiceTypeKey = "package" | "one_time";

const INVOICE_TYPE_LABELS: Record<InvoiceTypeKey, string> = {
  package: "Care package",
  one_time: "One-time",
};

/**
 * An invoice raised from an engagement or a signed agreement is a care package; anything
 * a doula recorded by hand is one-time. The reference shot's "Type" column is a SaaS
 * subscription/one-off split — this is the same column with the practice's own two kinds.
 */
export function invoiceType(row: Pick<InvoiceRecord, "engagementId" | "contractId">): InvoiceTypeKey {
  return row.engagementId || row.contractId ? "package" : "one_time";
}

export function invoiceTypeLabel(row: Pick<InvoiceRecord, "engagementId" | "contractId">): string {
  return INVOICE_TYPE_LABELS[invoiceType(row)];
}

/* ------------------------------------------------------------------ filters */

export type InvoiceFilters = {
  status: string;
  due: string;
  issued: string;
  type: string;
  q: string;
};

export type FilterOption = { value: string; label: string };

/** Status filter — the money states, in the order a doula triages them. */
export const STATUS_FILTERS: readonly FilterOption[] = [
  { value: "all", label: "Any status" },
  { value: "overdue", label: "Overdue" },
  { value: "outstanding", label: "Still owed" },
  { value: "failed", label: "Payment failed" },
  { value: "paid", label: "Paid" },
  { value: "closed", label: "Cancelled or refunded" },
];

export const DUE_FILTERS: readonly FilterOption[] = [
  { value: "all", label: "Any due date" },
  { value: "overdue", label: "Past due" },
  { value: "7", label: "Due in 7 days" },
  { value: "30", label: "Due in 30 days" },
  { value: "none", label: "No due date" },
];

export const ISSUED_FILTERS: readonly FilterOption[] = [
  { value: "all", label: "Any invoice date" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

export const TYPE_FILTERS: readonly FilterOption[] = [
  { value: "all", label: "Any type" },
  { value: "package", label: INVOICE_TYPE_LABELS.package },
  { value: "one_time", label: INVOICE_TYPE_LABELS.one_time },
];

export const EMPTY_FILTERS: InvoiceFilters = {
  status: "all",
  due: "all",
  issued: "all",
  type: "all",
  q: "",
};

/** An option value that is not in its own list falls back to "all" rather than filtering to nothing. */
function readOption(options: readonly FilterOption[], raw: string | undefined): string {
  const value = String(raw ?? "").trim();
  return options.some((option) => option.value === value) ? value : "all";
}

export function readFilters(params: Record<string, string | string[] | undefined>): InvoiceFilters {
  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  return {
    status: readOption(STATUS_FILTERS, single("status")),
    due: readOption(DUE_FILTERS, single("due")),
    issued: readOption(ISSUED_FILTERS, single("issued")),
    type: readOption(TYPE_FILTERS, single("type")),
    q: String(single("q") ?? "").trim(),
  };
}

export function hasActiveFilters(filters: InvoiceFilters): boolean {
  return (
    filters.status !== "all" ||
    filters.due !== "all" ||
    filters.issued !== "all" ||
    filters.type !== "all" ||
    filters.q !== ""
  );
}

/** Family name, family email or invoice number. Case- and whitespace-insensitive. */
export function invoiceMatchesSearch(row: InvoiceRecord, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [row.number, row.familyName, row.familyEmail, row.packageLabel ?? ""].some((field) =>
    field.toLowerCase().includes(needle),
  );
}

const DAY_MS = 86_400_000;

export function filterInvoices(
  rows: readonly InvoiceRecord[],
  filters: InvoiceFilters,
  now: Date,
): InvoiceRecord[] {
  return rows.filter((row) => {
    const state = invoiceMoneyState(row, now);
    if (filters.status === "overdue" && state !== "overdue") return false;
    // "Still owed" is the practical bucket: everything not settled and not called off,
    // which is what a doula means when she asks who has not paid.
    if (filters.status === "outstanding" && state !== "outstanding" && state !== "overdue") {
      return false;
    }
    if (filters.status === "paid" && state !== "paid") return false;
    if (filters.status === "closed" && state !== "closed") return false;
    if (filters.status === "failed" && staffInvoiceStatus(row, now).label !== "Payment failed") {
      return false;
    }

    if (filters.due === "overdue" && state !== "overdue") return false;
    if (filters.due === "none" && row.dueAt) return false;
    if (filters.due === "7" || filters.due === "30") {
      if (!row.dueAt) return false;
      const window = Number(filters.due) * DAY_MS;
      const delta = row.dueAt.getTime() - now.getTime();
      if (delta < 0 || delta > window) return false;
    }

    if (filters.issued !== "all") {
      const window = Number(filters.issued) * DAY_MS;
      if (now.getTime() - row.issuedAt.getTime() > window) return false;
    }

    if (filters.type !== "all" && invoiceType(row) !== filters.type) return false;

    return invoiceMatchesSearch(row, filters.q);
  });
}

/**
 * Newest first, but anything late floats to the top: the reason to open this page is the
 * money that has not arrived, and it should not be on page two.
 */
export function sortInvoices(rows: readonly InvoiceRecord[], now: Date): InvoiceRecord[] {
  return [...rows].sort((a, b) => {
    const aLate = isOverdue(a, now) ? 1 : 0;
    const bLate = isOverdue(b, now) ? 1 : 0;
    if (aLate !== bLate) return bLate - aLate;
    return b.issuedAt.getTime() - a.issuedAt.getTime();
  });
}

/* --------------------------------------------------------------- pagination */

export const INVOICE_PAGE_SIZE = 25;

export function pageCount(total: number, size = INVOICE_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

export function readPage(raw: string | string[] | undefined, total: number, size = INVOICE_PAGE_SIZE) {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.floor(value), pageCount(total, size));
}

export function pageSlice<T>(rows: readonly T[], page: number, size = INVOICE_PAGE_SIZE): T[] {
  const start = (page - 1) * size;
  return rows.slice(start, start + size);
}

/** "Showing 1–2 of 2 invoices" — the footer line under the table. */
export function showingLabel(page: number, total: number, size = INVOICE_PAGE_SIZE): string {
  if (total === 0) return "Nothing to show";
  const start = (page - 1) * size + 1;
  const end = Math.min(page * size, total);
  return `Showing ${start}–${end} of ${invoiceCountLabel(total)}`;
}

/* ------------------------------------------------------------ family rollup */

export type FamilyRollup = {
  clientId: string;
  name: string;
  email: string;
  initials: string;
  invoiceCount: number;
  billedCents: number;
  paidCents: number;
  outstandingCents: number;
  overdueCents: number;
  lastInvoiceAt: Date | null;
  lastInvoiceNumber: string | null;
};

/** Two letters from the family name, for the avatar chip in the Families table. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Who you bill, rolled up from the same invoice rows the table shows — never a second
 * query with a second definition of "paid". Sorted by what is owed, because the reason
 * to open this tab is to find the family to write to.
 */
export function familyRollups(rows: readonly InvoiceRecord[], now: Date): FamilyRollup[] {
  const byClient = new Map<string, FamilyRollup>();
  for (const row of rows) {
    const family = byClient.get(row.clientId) ?? {
      clientId: row.clientId,
      name: row.familyName,
      email: row.familyEmail,
      initials: initialsOf(row.familyName),
      invoiceCount: 0,
      billedCents: 0,
      paidCents: 0,
      outstandingCents: 0,
      overdueCents: 0,
      lastInvoiceAt: null,
      lastInvoiceNumber: null,
    };
    const state = invoiceMoneyState(row, now);
    family.invoiceCount += 1;
    if (state !== "closed") family.billedCents += row.amountCents;
    if (state === "paid") family.paidCents += row.amountCents;
    if (state === "outstanding" || state === "overdue") family.outstandingCents += row.amountCents;
    if (state === "overdue") family.overdueCents += row.amountCents;
    if (!family.lastInvoiceAt || row.issuedAt > family.lastInvoiceAt) {
      family.lastInvoiceAt = row.issuedAt;
      family.lastInvoiceNumber = row.number;
    }
    byClient.set(row.clientId, family);
  }
  return [...byClient.values()].sort(
    (a, b) => b.outstandingCents - a.outstandingCents || a.name.localeCompare(b.name),
  );
}

/* ----------------------------------------------------------- package rollup */

export type PackageSource = {
  id: string;
  packageLabel: string;
  amountCents: number;
  currency: string;
  status: string;
  clientId: string;
};

export type PackageRollup = {
  label: string;
  /** Lowest and highest amount the practice has actually charged for this package. */
  lowCents: number;
  highCents: number;
  currency: string;
  familyCount: number;
  activeCount: number;
  billedCents: number;
  outstandingCents: number;
};

/**
 * The reference dashboard's "Items" tab is a product catalog someone typed in. Tokos
 * already knows what this practice sells: the packages on its engagements, at the amounts
 * families were actually charged. So this tab is a read of real work, not a second place
 * to keep prices in sync — and it never shows a package nobody has ever been offered.
 */
export function packageRollups(
  engagements: readonly PackageSource[],
  invoiceRows: readonly InvoiceRecord[],
  now: Date,
): PackageRollup[] {
  const byLabel = new Map<string, PackageRollup & { clientIds: Set<string> }>();
  for (const engagement of engagements) {
    const label = engagement.packageLabel.trim() || "Unnamed package";
    const entry = byLabel.get(label) ?? {
      label,
      lowCents: engagement.amountCents,
      highCents: engagement.amountCents,
      currency: engagement.currency,
      familyCount: 0,
      activeCount: 0,
      billedCents: 0,
      outstandingCents: 0,
      clientIds: new Set<string>(),
    };
    entry.lowCents = Math.min(entry.lowCents, engagement.amountCents);
    entry.highCents = Math.max(entry.highCents, engagement.amountCents);
    entry.clientIds.add(engagement.clientId);
    if (engagement.status === "open" || engagement.status === "active") entry.activeCount += 1;
    byLabel.set(label, entry);
  }

  for (const row of invoiceRows) {
    const label = row.packageLabel?.trim();
    if (!label) continue;
    const entry = byLabel.get(label);
    if (!entry) continue;
    const state = invoiceMoneyState(row, now);
    if (state === "closed") continue;
    entry.billedCents += row.amountCents;
    if (state !== "paid") entry.outstandingCents += row.amountCents;
  }

  return [...byLabel.values()]
    .map(({ clientIds, ...rest }) => ({ ...rest, familyCount: clientIds.size }))
    .sort((a, b) => b.billedCents - a.billedCents || a.label.localeCompare(b.label));
}

/* ------------------------------------------------------------- CSV export */

export const INVOICE_CSV_HEADERS = [
  "Invoice",
  "Family",
  "Email",
  "Type",
  "Package",
  "Amount",
  "Currency",
  "Status",
  "Issue date",
  "Due date",
  "Paid on",
] as const;

function csvDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

/** Amounts export as plain decimals — a spreadsheet should get a number, not "$1,200.00". */
function csvAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function invoiceCsvRow(row: InvoiceRecord, now: Date): string[] {
  return [
    row.number,
    row.familyName,
    row.familyEmail,
    invoiceTypeLabel(row),
    row.packageLabel ?? "",
    csvAmount(row.amountCents),
    row.currency.toUpperCase(),
    staffInvoiceStatus(row, now).label,
    csvDate(row.issuedAt),
    csvDate(row.dueAt),
    // Only a cleared invoice has a paid date. A `paid_at` left behind by a later refund
    // does not get to export as though the money is still here.
    invoiceCleared(row) ? csvDate(row.paidAt) : "",
  ];
}

/** RFC 4180: quote everything, double the quotes inside. Family names have commas in them. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function invoicesToCsv(rows: readonly InvoiceRecord[], now: Date): string {
  return toCsv(
    INVOICE_CSV_HEADERS,
    rows.map((row) => invoiceCsvRow(row, now)),
  );
}

export function invoiceCsvFilename(now: Date): string {
  return `tokos-invoices-${now.toISOString().slice(0, 10)}.csv`;
}

/* --------------------------------------------------------------- numbering */

/**
 * The practice's own numbering. It is `NOVA-1001` upward because that is what the seeded
 * ledger already reads and a prefix change would orphan every invoice issued so far —
 * the Templates tab shows it rather than offering an edit that would break continuity.
 */
export const INVOICE_NUMBER_PREFIX = "NOVA";
export const INVOICE_NUMBER_START = 1001;

export function nextInvoiceNumber(existingCount: number, prefix = INVOICE_NUMBER_PREFIX): string {
  return `${prefix}-${INVOICE_NUMBER_START + existingCount}`;
}

/* ---------------------------------------------------------- template config */

export type PaymentTermOption = FilterOption & { days: number };

/** How long a family gets. The 7-day default is what `sendContract` has always written. */
export const PAYMENT_TERMS: readonly PaymentTermOption[] = [
  { value: "0", label: "Due on receipt", days: 0 },
  { value: "7", label: "Due in 7 days", days: 7 },
  { value: "14", label: "Due in 14 days", days: 14 },
  { value: "30", label: "Due in 30 days", days: 30 },
];

export const DEFAULT_PAYMENT_TERM_DAYS = 7;

export function paymentTermLabel(days: number): string {
  return PAYMENT_TERMS.find((term) => term.days === days)?.label ?? `Due in ${days} days`;
}

export function dueDateFrom(issuedAt: Date, days = DEFAULT_PAYMENT_TERM_DAYS): Date {
  return new Date(issuedAt.getTime() + days * DAY_MS);
}

/**
 * What a family can actually pay with today. Card is live through Checkout; bank debit is
 * not wired, and a "Bank transfer" row a family cannot use is a lie with a chevron on it
 * (the reference shot has six card brands and an ACH dropdown — we ship the one that works).
 */
export const PAYMENT_METHODS: readonly { key: string; label: string; live: boolean; note: string }[] = [
  { key: "card", label: "Card", live: true, note: "Visa, Mastercard, Amex — through Stripe Checkout" },
  {
    key: "external",
    label: "Recorded by hand",
    live: true,
    note: "A cheque, a transfer, cash at a visit — recorded against the invoice by staff",
  },
];

/**
 * Invoice accent, from Faith's four. The reference shot offers amber/blue/purple/orange/teal;
 * a purple invoice is not this brand, so the palette is the brand's own and the value that
 * gets written is the practice colour the portal and emails already use.
 */
export type AccentOption = { value: string; label: string; swatchClass: string };

export const INVOICE_ACCENTS: readonly AccentOption[] = [
  { value: "#0F6E56", label: "Teal", swatchClass: "bg-teal" },
  { value: "#04342C", label: "Teal ink", swatchClass: "bg-teal-ink" },
  { value: "#D85A30", label: "Coral", swatchClass: "bg-coral" },
  { value: "#4E9C86", label: "Sea", swatchClass: "bg-[color:var(--chart-3)]" },
];

/** Reminder cadence Tokos runs today. Honest about which rungs are live (TOK-55). */
export const INVOICE_REMINDERS: readonly { key: string; label: string; live: boolean; note: string }[] =
  [
    {
      key: "on_send",
      label: "Email the family when the invoice goes out",
      live: true,
      note: "Sent with the care agreement, from your Email templates",
    },
    {
      key: "overdue_queue",
      label: "Raise it on Needs attention once it is past due",
      live: true,
      note: "The overdue invoice becomes a row on your review board the morning it is late",
    },
    {
      key: "auto_chase",
      label: "Automatic chase emails every 7 days until it clears",
      live: false,
      note: "Not scheduled yet — chase from the family's record for now",
    },
  ];

/* -------------------------------------------------------------------- copy */

export const INVOICE_TABS = [
  { href: "/doula/invoices", label: "Invoicing", exact: true },
  { href: "/doula/invoices/families", label: "Families", exact: false },
  { href: "/doula/invoices/packages", label: "Packages", exact: false },
  { href: "/doula/invoices/templates", label: "Templates", exact: false },
] as const;

/**
 * Every string on the surface. "Buyers" is the reference product's word for the people it
 * bills; the people this practice bills are families, and there is no screen in Tokos
 * where a doula should read corporate procurement vocabulary about them.
 */
export const INVOICE_COPY = {
  title: "Invoicing",
  eyebrow: "Money",
  subtitle: "What you have billed, what has cleared, and who is still owed a nudge.",
  toolbar: {
    searchPlaceholder: "Search by family or invoice number",
    searchLabel: "Search invoices",
    export: "Export CSV",
    exportHint: "Downloads the rows you are looking at now",
    newInvoice: "New invoice",
    clear: "Clear filters",
  },
  table: {
    columns: ["Invoice", "Type", "Family", "Amount", "Status", "Issued", "Due"] as const,
    rowActions: "Row actions",
    openFamily: "Open family",
    markPaidShort: "Mark paid outside Tokos",
  },
  families: {
    title: "Families",
    subtitle: "Who you bill — one row per family, with what is still owed first.",
    columns: ["Family", "Invoices", "Billed", "Paid", "Outstanding", "Last invoice"] as const,
    searchPlaceholder: "Search families",
    empty: {
      title: "No families billed yet",
      body: "A family appears here the moment her first invoice goes out with a care agreement.",
    },
  },
  packages: {
    title: "Care packages",
    subtitle: "What this practice sells, read from the engagements you have actually opened.",
    columns: ["Package", "Families", "Amount", "Billed", "Outstanding"] as const,
    empty: {
      title: "No packages yet",
      body: "Open an engagement on a family and the package she was offered shows up here.",
    },
  },
  templates: {
    title: "Invoice template",
    subtitle: "What a family sees at the top of every invoice, and the defaults Tokos applies.",
    businessHeading: "Business information",
    previewHeading: "Live preview",
    numberingHeading: "Invoice numbering",
    paymentHeading: "Payment",
    remindersHeading: "Reminders",
    styleHeading: "Invoice style",
    savedNotice: "Invoice template saved. Families see it on their next invoice.",
    errorNotice: "That did not save — check the website and phone fields and try again.",
    defaultsNote:
      "These are the defaults Tokos applies today. Anything marked as not yet scheduled is not running behind your back.",
  },
  empty: {
    title: "No invoices yet",
    body: "Sending a care agreement raises the invoice from the package amount — or record one here by hand.",
  },
  filteredEmpty: {
    title: "Nothing matches those filters",
    body: "Clear a filter or widen the search to see the rest of the ledger.",
  },
  newInvoice: {
    heading: "New invoice",
    blurb:
      "Raises an open invoice against a family, payable by card in her portal. The care-agreement flow raises its own.",
    family: "Family",
    amount: "Amount",
    amountHint: "In dollars, e.g. 1200",
    description: "What it is for",
    descriptionHint: "Shows on the invoice as its single line",
    terms: "Payment terms",
    submit: "Raise invoice",
    noFamilies: "Add a family first — an invoice has to be owed by someone.",
  },
  markPaid: {
    heading: "Record a payment taken outside Tokos",
    blurb:
      "For a cheque, a transfer or cash at a visit. This marks the invoice cleared and moves the family forward, so only record money you have actually received.",
    reference: "Reference",
    referenceHint: "Cheque number, transfer reference — kept on the payment record",
    submit: "Record payment",
  },
} as const;

export const INVOICE_NOTICES: Record<string, { tone: "teal" | "coral"; text: string }> = {
  created: { tone: "teal", text: "Invoice raised. The family can pay it from her portal now." },
  recorded: { tone: "teal", text: "Payment recorded. The invoice reads Paid and the family is settled." },
  template: { tone: "teal", text: INVOICE_COPY.templates.savedNotice },
  amount: { tone: "coral", text: "Enter an amount over zero — an invoice for nothing helps nobody." },
  family: { tone: "coral", text: "Pick the family this invoice is owed by." },
  cleared: { tone: "coral", text: "That invoice is already settled — nothing was recorded twice." },
  missing: { tone: "coral", text: "That invoice could not be found in your practice." },
  brand: { tone: "coral", text: INVOICE_COPY.templates.errorNotice },
};

/**
 * Dollars in a text box, cents in the database. A blank, a negative, a stray `$1,200.00`
 * and `12.345` all have to land somewhere predictable rather than as `NaN` cents.
 */
export function parseAmountToCents(raw: string | null | undefined): number | null {
  const value = String(raw ?? "").replace(/[$,\s]/g, "");
  if (!value) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return cents > 0 ? cents : null;
}
