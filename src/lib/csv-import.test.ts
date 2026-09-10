import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  IMPORTABLE_STAGES,
  IMPORT_SOURCE,
  mapColumns,
  mapCsv,
  normalizeDate,
  normalizeImportStage,
  normalizeServiceType,
  parseCsv,
  planImport,
  planSummary,
  updateValuesFor,
  type ExistingClient,
  type LeadImportRecord,
} from "./csv-import";

/**
 * The migration test case: 44 leads shaped like NOVA's Airtable export. The fixture is
 * invented — fake names on `example.invalid` — and carries no credential of any kind.
 */
const FIXTURE = readFileSync(
  join(process.cwd(), "scripts/fixtures/nova-leads-sample.csv"),
  "utf8",
);

describe("parseCsv", () => {
  it("reads quoted fields, escaped quotes, embedded commas and newlines", () => {
    const rows = parseCsv('a,b\n"one, two","he said ""hi"""\n"multi\nline",x\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["one, two", 'he said "hi"'],
      ["multi\nline", "x"],
    ]);
  });

  it("handles CRLF and a UTF-8 BOM from Excel", () => {
    const rows = parseCsv("﻿Name,Email\r\nAmara,a@example.invalid\r\n");
    expect(rows[0][0]).toBe("Name");
    expect(rows[1]).toEqual(["Amara", "a@example.invalid"]);
  });

  it("drops entirely blank lines", () => {
    expect(parseCsv("a\n\n\nb\n")).toEqual([["a"], ["b"]]);
  });
});

describe("column mapping", () => {
  it("matches headers loosely on case and punctuation", () => {
    const map = mapColumns(["Intake #", "FULL NAME", "e-mail", "Follow-Up Due", "Nickname"]);
    expect(map.intakeRef).toBe(0);
    expect(map.displayName).toBe(1);
    expect(map.email).toBe(2);
    expect(map.followUpDueOn).toBe(3);
    expect(map.ownerName).toBeUndefined();
  });

  it("reports headers nothing consumed rather than silently ignoring a typo", () => {
    const mapped = mapCsv("Name,Email,Favourite Colour\nA,a@example.invalid,teal\n");
    expect(mapped.unmappedHeaders).toEqual(["Favourite Colour"]);
  });
});

describe("value normalisation", () => {
  it("accepts ISO and US dates and refuses anything ambiguous", () => {
    expect(normalizeDate("2026-10-13")).toBe("2026-10-13");
    expect(normalizeDate("10/13/2026")).toBe("2026-10-13");
    expect(normalizeDate("1/2/27")).toBe("2027-01-02");
    expect(normalizeDate("next tuesday")).toBeNull();
    expect(normalizeDate("2026-02-31")).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });

  it("maps service labels and common spellings onto the picker", () => {
    expect(normalizeServiceType("Birth support")).toBe("birth_support");
    expect(normalizeServiceType("night nanny")).toBe("overnight");
    expect(normalizeServiceType("Mother's helper")).toBe("mothers_helper");
    expect(normalizeServiceType("astrology")).toBeNull();
  });

  it("never lets a spreadsheet claim a signed or paid stage", () => {
    expect(normalizeImportStage("Agreement signed")).toBe("new_lead");
    expect(normalizeImportStage("complete")).toBe("new_lead");
    expect(normalizeImportStage("active care")).toBe("new_lead");
    for (const stage of IMPORTABLE_STAGES) {
      expect(normalizeImportStage(stage, { hasConsultDate: true })).toBe(stage);
    }
  });

  it("honours the consult-date gate rather than writing a stage the dropdown refuses", () => {
    expect(normalizeImportStage("Consult scheduled", { hasConsultDate: false })).toBe(
      "outreach_sent",
    );
    expect(normalizeImportStage("Consult scheduled", { hasConsultDate: true })).toBe(
      "consult_scheduled",
    );
  });

  it("reads legacy stage words through the same migration map", () => {
    expect(normalizeImportStage("intro")).toBe("outreach_sent");
  });
});

describe("validation", () => {
  it("skips a row with no name or no usable email, with its line number", () => {
    const mapped = mapCsv(
      ["Name,Email", ",a@example.invalid", "Brynn,", "Camille,not-an-email"].join("\n"),
    );
    expect(mapped.records).toHaveLength(0);
    expect(mapped.errors.map((error) => [error.line, error.field])).toEqual([
      [2, "displayName"],
      [3, "email"],
      [4, "email"],
    ]);
  });

  it("lowercases email so dedupe is not defeated by capitalisation", () => {
    const mapped = mapCsv("Name,Email\nAmara,Amara.A@Example.Invalid\n");
    expect(mapped.records[0].email).toBe("amara.a@example.invalid");
  });

  it("tags every row imported, whatever the sheet's own Source column says", () => {
    const mapped = mapCsv("Name,Email,Source\nAmara,a@example.invalid,Instagram\n");
    expect(mapped.records[0].source).toBe(IMPORT_SOURCE);
  });
});

describe("the 44-lead fixture", () => {
  const mapped = mapCsv(FIXTURE);

  it("reads every row with no errors", () => {
    expect(mapped.records).toHaveLength(44);
    expect(mapped.errors).toEqual([]);
    expect(mapped.unmappedHeaders).toEqual([]);
  });

  it("carries no real contact details — every address is undeliverable", () => {
    for (const record of mapped.records) {
      expect(record.email.endsWith("@example.invalid")).toBe(true);
    }
  });

  it("maps the fields the board renders", () => {
    const first = mapped.records[0];
    expect(first.intakeRef).toBe("PSAF-3001");
    expect(first.displayName).toBe("Amara Alderman");
    expect(first.serviceType).toBe("birth_support");
    expect(first.edd).toBe("2027-01-01");
    expect(first.postalCode).toBe("22201");
    expect(first.insurance).toBe("yes");
    expect(first.ownerName).toBe("Maya Chen");
  });

  it("uses its own intake series so it cannot collide with the seeded demo leads", () => {
    const refs = mapped.records.map((record) => record.intakeRef);
    expect(new Set(refs).size).toBe(44);
    for (const ref of refs) expect(ref).toMatch(/^PSAF-3\d{3}$/);
  });

  it("creates 44 leads on a first import into an empty org", () => {
    const plan = planImport(mapped.records, []);
    expect(plan.creates).toBe(44);
    expect(plan.updates).toBe(0);
    expect(plan.skipped).toBe(0);
    expect(planSummary(plan)).toBe("44 new · 0 updated");
  });

  it("updates all 44 on a re-import instead of doubling the board", () => {
    const existing: ExistingClient[] = mapped.records.map((record, index) => ({
      id: `client-${index}`,
      email: record.email,
      intakeRef: record.intakeRef,
    }));
    const plan = planImport(mapped.records, existing);
    expect(plan.creates).toBe(0);
    expect(plan.updates).toBe(44);
  });
});

describe("dedupe", () => {
  const record = (over: Partial<LeadImportRecord>): LeadImportRecord => ({
    line: 2,
    intakeRef: null,
    displayName: "Amara Alderman",
    email: "amara@example.invalid",
    phone: null,
    serviceType: null,
    edd: null,
    city: null,
    postalCode: null,
    hospital: null,
    assignedProvider: null,
    insurance: "unknown",
    insuranceProvider: null,
    consultDate: null,
    followUpDueOn: null,
    lastContactOn: null,
    stage: null,
    ownerName: null,
    notes: null,
    source: IMPORT_SOURCE,
    ...over,
  });

  it("matches on Intake # first — the identity NOVA already trusts", () => {
    const plan = planImport(
      [record({ intakeRef: "PSAF-1001", email: "new-address@example.invalid" })],
      [{ id: "existing", email: "old-address@example.invalid", intakeRef: "PSAF-1001" }],
    );
    expect(plan.actions[0]).toMatchObject({
      kind: "update",
      clientId: "existing",
      matchedOn: "intakeRef",
    });
  });

  it("falls back to email when there is no intake number", () => {
    const plan = planImport(
      [record({})],
      [{ id: "existing", email: "amara@example.invalid", intakeRef: null }],
    );
    expect(plan.actions[0]).toMatchObject({ kind: "update", clientId: "existing", matchedOn: "email" });
  });

  it("is case-insensitive on both keys", () => {
    const plan = planImport(
      [record({ intakeRef: "psaf-1001" })],
      [{ id: "existing", email: "x@example.invalid", intakeRef: "PSAF-1001" }],
    );
    expect(plan.updates).toBe(1);
  });

  it("skips a second row in the same file that resolves to the same lead", () => {
    const plan = planImport(
      [record({ intakeRef: "PSAF-1001" }), record({ intakeRef: "PSAF-1001", displayName: "Dup" })],
      [],
    );
    expect(plan.creates).toBe(1);
    expect(plan.skipped).toBe(1);
  });

  it("does not create a duplicate when a later row carries only the email of one already planned", () => {
    const plan = planImport(
      [record({ intakeRef: "PSAF-1001" }), record({ intakeRef: null })],
      [],
    );
    expect(plan.creates).toBe(1);
    expect(plan.skipped).toBe(1);
  });

  it("treats two different intake numbers as two leads even on one address", () => {
    const plan = planImport(
      [record({ intakeRef: "PSAF-1001" }), record({ intakeRef: "PSAF-1002" })],
      [],
    );
    expect(plan.creates).toBe(2);
  });
});

describe("update values", () => {
  const base: LeadImportRecord = {
    line: 2,
    intakeRef: null,
    displayName: "Amara Alderman",
    email: "amara@example.invalid",
    phone: null,
    serviceType: null,
    edd: null,
    city: null,
    postalCode: null,
    hospital: null,
    assignedProvider: null,
    insurance: "unknown",
    insuranceProvider: null,
    consultDate: null,
    followUpDueOn: null,
    lastContactOn: null,
    stage: null,
    ownerName: null,
    notes: null,
    source: IMPORT_SOURCE,
  };

  it("never clears a column the sheet happens to be missing", () => {
    const values = updateValuesFor(base);
    expect(values).not.toHaveProperty("city");
    expect(values).not.toHaveProperty("intakeRef");
  });

  it("preserves an intake number when the sheet still carries one", () => {
    expect(updateValuesFor({ ...base, intakeRef: "PSAF-1001" }).intakeRef).toBe("PSAF-1001");
  });

  it("always writes the imported source", () => {
    expect(updateValuesFor(base).source).toBe("imported");
  });
});
