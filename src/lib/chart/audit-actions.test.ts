import { describe, expect, it } from "vitest";

import { assertPhiFree } from "@/lib/phi";
import {
  CHART_AUDIT_ACTIONS,
  CHART_ENTITY_TYPES,
  chartAuditMetadata,
} from "./audit-actions";

describe("chart audit vocabulary (TOK-44)", () => {
  it("namespaces every chart action so an audit query can find them all", () => {
    for (const action of Object.values(CHART_AUDIT_ACTIONS)) {
      expect(action).toMatch(/^chart\.[a-z_]+$/);
    }
    expect(new Set(Object.values(CHART_AUDIT_ACTIONS)).size).toBe(
      Object.values(CHART_AUDIT_ACTIONS).length,
    );
  });

  it("audits reads and shares, not just writes", () => {
    expect(CHART_AUDIT_ACTIONS.viewed).toBeDefined();
    expect(CHART_AUDIT_ACTIONS.shared).toBeDefined();
    expect(CHART_AUDIT_ACTIONS.breakGlass).toBeDefined();
    expect(CHART_AUDIT_ACTIONS.signed).toBeDefined();
    expect(CHART_AUDIT_ACTIONS.amended).toBeDefined();
  });

  it("names the three chart tables and nothing else", () => {
    expect(Object.values(CHART_ENTITY_TYPES)).toEqual(["visit_note", "birth_log", "care_plan"]);
  });

  it("builds metadata the PHI firewall accepts", () => {
    const metadata = chartAuditMetadata({
      entityType: CHART_ENTITY_TYPES.birthLog,
      clientId: "11111111-1111-4111-8111-111111111111",
      engagementId: "22222222-2222-4222-8222-222222222222",
      version: 2,
      sharePolicy: "staff_only",
      reason: "on-call cover",
    });
    expect(() => assertPhiFree(metadata, "chart audit")).not.toThrow();
    expect(metadata.record_type).toBe("birth_log");
    expect(metadata.version).toBe("2");
  });

  it("carries ids, never answers", () => {
    const metadata = chartAuditMetadata({ entityType: CHART_ENTITY_TYPES.visitNote });
    expect(Object.keys(metadata)).toEqual(["record_type"]);
  });
});
