import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

/**
 * A hand-raised invoice had no `payment_statuses` row, so there was nowhere to record a
 * decline, a refund, or a bank debit still in flight against it (TOK-61). These pin the
 * two halves of the fix: the row is opened for every invoice, and every reader finds it
 * whether it is anchored to the invoice or — for rows written before TOK-61 — only to a
 * contract.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => {
  const state = {
    /** What the next `select(...).limit(n)` answers with. */
    selectResult: [] as Row[],
    /** What the next `update(...).returning()` answers with. */
    updateResult: [] as Row[],
    inserts: [] as Row[],
    updates: [] as Row[],
  };
  const handle = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => state.selectResult,
        }),
      }),
    }),
    insert: () => ({
      values: async (values: Row) => {
        state.inserts.push(values);
      },
    }),
    update: () => ({
      set: (values: Row) => ({
        where: () => ({
          returning: async () => {
            state.updates.push(values);
            return state.updateResult;
          },
        }),
      }),
    }),
  };
  return { state, handle };
});

vi.mock("@/db", () => ({ getDb: () => db.handle }));

const {
  openPaymentStatus,
  paymentStatusForInvoice,
  paymentStatusJoin,
  setPaymentStatusForInvoice,
} = await import("@/lib/payment-status");

const ORG = "11111111-1111-4111-8111-111111111111";
const INVOICE = "99999999-9999-4999-8999-999999999991";
const CONTRACT = "88888888-8888-4888-8888-888888888881";

function sqlText(query: { queryChunks: unknown[] }): string {
  return new PgDialect().sqlToQuery(query as never).sql;
}

beforeEach(() => {
  db.state.selectResult = [];
  db.state.updateResult = [];
  db.state.inserts = [];
  db.state.updates = [];
});

describe("payment row lookup (TOK-61)", () => {
  it("matches a hand invoice by its own id and nothing else", () => {
    const text = sqlText(paymentStatusForInvoice({ id: INVOICE, contractId: null }));
    expect(text).toContain('"invoice_id"');
    // A hand invoice has no contract, and `contract_id = NULL` matches nothing while
    // looking like a condition — leaving it in would keep the old silent blank.
    expect(text).not.toContain('"contract_id"');
  });

  it("also matches the contract, so a row written before TOK-61 is still found", () => {
    const text = sqlText(paymentStatusForInvoice({ id: INVOICE, contractId: CONTRACT }));
    expect(text).toContain('"invoice_id"');
    expect(text).toContain('"contract_id"');
    expect(text.toLowerCase()).toContain(" or ");
  });

  it("joins on the invoice first, falling back to the contract only for legacy rows", () => {
    const text = sqlText(paymentStatusJoin());
    expect(text).toContain('"invoice_id"');
    expect(text).toContain('"contract_id"');
    // The legacy leg is fenced by `invoice_id is null`, so a row that names its invoice
    // can never also be dragged in through the contract of a different bill.
    expect(text.toLowerCase()).toContain("is null");
  });
});

describe("openPaymentStatus (TOK-61)", () => {
  it("opens a hand invoice's row as due, anchored to the invoice, with no contract", async () => {
    await openPaymentStatus({ organizationId: ORG, invoiceId: INVOICE, amountCents: 25_000 });
    expect(db.state.inserts).toHaveLength(1);
    expect(db.state.inserts[0]).toMatchObject({
      organizationId: ORG,
      invoiceId: INVOICE,
      contractId: null,
      status: "due",
      amountCents: 25_000,
    });
  });

  it("never opens a row as cleared — raising a bill is not receiving money", async () => {
    await openPaymentStatus({ organizationId: ORG, invoiceId: INVOICE, amountCents: 1 });
    expect(db.state.inserts[0].status).toBe("due");
    expect(db.state.inserts[0].clearedAt).toBeUndefined();
  });

  it("carries the contract too when the invoice came from one", async () => {
    await openPaymentStatus({
      organizationId: ORG,
      invoiceId: INVOICE,
      contractId: CONTRACT,
      amountCents: 90_000,
    });
    expect(db.state.inserts[0]).toMatchObject({ invoiceId: INVOICE, contractId: CONTRACT });
  });

  it("is idempotent: a retried action does not leave two rows against one bill", async () => {
    db.state.selectResult = [{ id: "existing" }];
    await openPaymentStatus({ organizationId: ORG, invoiceId: INVOICE, amountCents: 25_000 });
    expect(db.state.inserts).toHaveLength(0);
  });
});

describe("setPaymentStatusForInvoice (TOK-61)", () => {
  it("updates the row that already exists", async () => {
    db.state.updateResult = [{ id: "row" }];
    await setPaymentStatusForInvoice({
      organizationId: ORG,
      invoice: { id: INVOICE, contractId: null, amountCents: 25_000 },
      status: "failed",
      method: "manual",
      clearedAt: null,
    });
    expect(db.state.updates).toHaveLength(1);
    expect(db.state.updates[0]).toMatchObject({ status: "failed", clearedAt: null });
    expect(db.state.inserts).toHaveLength(0);
  });

  it("backfills a pre-TOK-61 invoice that never had one, rather than losing the fact", async () => {
    db.state.updateResult = [];
    await setPaymentStatusForInvoice({
      organizationId: ORG,
      invoice: { id: INVOICE, contractId: null, amountCents: 25_000 },
      status: "cleared",
      method: "stripe",
      externalId: "cs_test_1",
      clearedAt: new Date("2026-01-02T00:00:00Z"),
    });
    expect(db.state.inserts).toHaveLength(1);
    expect(db.state.inserts[0]).toMatchObject({
      invoiceId: INVOICE,
      status: "cleared",
      externalId: "cs_test_1",
      amountCents: 25_000,
    });
  });

  it("records a decline without clearing anything — fail is never Paid (TOK-48)", async () => {
    db.state.updateResult = [{ id: "row" }];
    await setPaymentStatusForInvoice({
      organizationId: ORG,
      invoice: { id: INVOICE, contractId: CONTRACT, amountCents: 90_000 },
      status: "failed",
      method: "manual",
      clearedAt: null,
    });
    expect(db.state.updates[0].status).toBe("failed");
    expect(db.state.updates[0].clearedAt).toBeNull();
  });
});
