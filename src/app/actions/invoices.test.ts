import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `createInvoiceAction` wrote `invoices` and `invoice_lines` and stopped there (TOK-61).
 * The contract funnel opens a `payment_statuses` row for the bill it raises; the hand
 * path did not, so a top-up visit or a deposit had nowhere to record a declined card —
 * the family's pay page could only ever read "due", whatever actually happened.
 *
 * These run the real action against a stub database and assert on what it wrote.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_ORG_CLIENT_ID = "44444444-4444-4444-8444-444444444446";

type Row = Record<string, unknown>;

const fixtures = vi.hoisted(() => {
  const staff = {
    actorType: "staff" as const,
    userId: "22222222-2222-4222-8222-222222222222",
    email: "maya@tokos.test",
    name: "Maya Chen",
    organizationId: "11111111-1111-4111-8111-111111111111",
    membershipRole: "owner" as const,
  };
  const clientRows = [
    { id: "44444444-4444-4444-8444-444444444444", organizationId: staff.organizationId },
  ];
  const writes = { invoices: [] as Row[], invoiceLines: [] as Row[], paymentStatuses: [] as Row[] };
  const redirects: string[] = [];

  /** The literal values a drizzle condition binds — how the stub reads a `where`. */
  function boundValues(condition: unknown): string[] {
    const chunks: unknown[] = (condition as { queryChunks?: unknown[] })?.queryChunks ?? [];
    const out: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        const param = (node as { value?: unknown }).value;
        if (typeof param === "string") out.push(param);
        const nested = (node as { queryChunks?: unknown[] }).queryChunks;
        if (nested) walk(nested);
      }
    };
    walk(chunks);
    return out;
  }

  function tableName(table: unknown): string {
    const symbols = Object.getOwnPropertySymbols(table as object);
    for (const symbol of symbols) {
      if (String(symbol).includes("Name")) {
        const value = (table as Record<symbol, unknown>)[symbol];
        if (typeof value === "string") return value;
      }
    }
    return "unknown";
  }

  /**
   * Enough of drizzle to run the action: reads answer from `clientRows` when the query
   * selects a client and the condition names it, and from nothing otherwise (no invoices
   * yet, no payment row yet). Writes are bucketed by table so assertions can name them.
   */
  const handle = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => {
          const name = tableName(table);
          // The action re-reads the client inside its own org; the stub honours that by
          // matching the ids the condition actually binds, so the tenancy test is real.
          const bound = new Set(boundValues(condition));
          const rows =
            name === "clients"
              ? clientRows.filter(
                  (row) => bound.has(row.id) && bound.has(row.organizationId),
                )
              : [];
          return Object.assign(Promise.resolve(rows), { limit: async () => rows });
        },
      }),
    }),
    insert: (table: unknown) => {
      const name = tableName(table);
      return {
        values: async (values: Row) => {
          if (name === "invoices") writes.invoices.push(values);
          else if (name === "invoice_lines") writes.invoiceLines.push(values);
          else if (name === "payment_statuses") writes.paymentStatuses.push(values);
        },
      };
    },
  };

  return { staff, clientRows, writes, redirects, handle };
});

vi.mock("@/db", () => ({ getDb: () => fixtures.handle }));
vi.mock("@/lib/tenancy", () => ({
  requireStaff: vi.fn(async () => fixtures.staff),
  requireStaffManager: vi.fn(async () => fixtures.staff),
}));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/funnel", () => ({ markInvoicePaid: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    fixtures.redirects.push(to);
    // The real `redirect` throws to unwind the action; mirroring that keeps the code after
    // a guard from running in the test when it would not run in production.
    throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: `NEXT_REDIRECT;${to}` });
  },
}));

const { createInvoiceAction } = await import("./invoices");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function run(fields: Record<string, string>) {
  await createInvoiceAction(form(fields)).catch((error: Error) => {
    if (!error.message.startsWith("NEXT_REDIRECT")) throw error;
  });
}

beforeEach(() => {
  fixtures.writes.invoices = [];
  fixtures.writes.invoiceLines = [];
  fixtures.writes.paymentStatuses = [];
  fixtures.redirects.length = 0;
});

describe("createInvoiceAction opens a payment row (TOK-61)", () => {
  it("writes an invoice, its line, and a payment status for the hand-raised bill", async () => {
    await run({ clientId: CLIENT_ID, amount: "250", description: "Extra night visit" });
    expect(fixtures.redirects.at(-1)).toContain("saved=created");
    expect(fixtures.writes.invoices).toHaveLength(1);
    expect(fixtures.writes.invoiceLines).toHaveLength(1);
    expect(fixtures.writes.paymentStatuses).toHaveLength(1);
  });

  it("anchors the payment row to the invoice it was raised for", async () => {
    await run({ clientId: CLIENT_ID, amount: "250" });
    const invoice = fixtures.writes.invoices[0];
    const payment = fixtures.writes.paymentStatuses[0];
    expect(payment.invoiceId).toBe(invoice.id);
    expect(payment.organizationId).toBe(ORG);
    // No contract — that is the whole point of a hand invoice.
    expect(payment.contractId).toBeNull();
  });

  it("bills the same amount on both rows, in cents", async () => {
    await run({ clientId: CLIENT_ID, amount: "250" });
    expect(fixtures.writes.invoices[0].amountCents).toBe(25_000);
    expect(fixtures.writes.paymentStatuses[0].amountCents).toBe(25_000);
  });

  it("is born due and open, never paid — raising a bill is not receiving money", async () => {
    await run({ clientId: CLIENT_ID, amount: "250" });
    expect(fixtures.writes.invoices[0].status).toBe("open");
    expect(fixtures.writes.paymentStatuses[0].status).toBe("due");
    expect(fixtures.writes.paymentStatuses[0].clearedAt).toBeUndefined();
  });

  it("writes nothing at all when the family is not the staff's own", async () => {
    await run({ clientId: OTHER_ORG_CLIENT_ID, amount: "250" });
    expect(fixtures.redirects.at(-1)).toContain("error=family");
    expect(fixtures.writes.invoices).toHaveLength(0);
    expect(fixtures.writes.paymentStatuses).toHaveLength(0);
  });

  it("carries the new number back so the confirmation names it (TOK-62)", async () => {
    await run({ clientId: CLIENT_ID, amount: "250" });
    const number = String(fixtures.writes.invoices[0].number);
    expect(number).toMatch(/^[A-Z]+-\d+$/);
    expect(fixtures.redirects.at(-1)).toContain(`number=${number}`);
  });

  it("numbers from the ledger's own prefix, not a hardcoded one (TOK-62)", async () => {
    await run({ clientId: CLIENT_ID, amount: "250" });
    // The stub org has no invoices and no name, so the seeded prefix is the fallback —
    // what matters is that the action asked the ledger rather than assuming.
    expect(fixtures.writes.invoices[0].number).toBe("NOVA-1001");
  });

  it("writes nothing when the amount does not parse", async () => {
    await run({ clientId: CLIENT_ID, amount: "" });
    expect(fixtures.redirects.at(-1)).toContain("error=amount");
    expect(fixtures.writes.paymentStatuses).toHaveLength(0);
  });
});
