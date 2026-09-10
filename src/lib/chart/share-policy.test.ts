import { describe, expect, it } from "vitest";

import { chartFieldKeys, clinicalFieldKeys, CHART_DOCUMENT_KEYS } from "./field-defs";
import {
  BIRTH_LOG_DEFAULT_SHARE_POLICY,
  CARE_PLAN_SHAREABLE_POLICY,
  DEFAULT_SHARE_POLICY,
  DOCUMENT_DEFAULT_SHARE_POLICY,
  SHARE_POLICIES,
  clientVisibleFieldKeys,
  isClientVisibleField,
  isSharePolicy,
} from "./share-policy";

describe("chart share policy (TOK-44, Faith K1)", () => {
  it("starts every document closed", () => {
    expect(DEFAULT_SHARE_POLICY).toBe("staff_only");
    for (const document of CHART_DOCUMENT_KEYS) {
      expect(DOCUMENT_DEFAULT_SHARE_POLICY[document]).toBe("staff_only");
      expect(clientVisibleFieldKeys(document, "staff_only")).toEqual([]);
    }
  });

  it("keeps the birth log staff-only under every policy there is", () => {
    expect(BIRTH_LOG_DEFAULT_SHARE_POLICY).toBe("staff_only");
    const clinical = clinicalFieldKeys("birth_log");
    for (const policy of SHARE_POLICIES) {
      const visible = clientVisibleFieldKeys("birth_log", policy);
      for (const key of clinical) {
        expect(visible, `${key} leaked under ${policy}`).not.toContain(key);
      }
      expect(isClientVisibleField("birth_log", policy, "labor_grid")).toBe(false);
      expect(isClientVisibleField("birth_log", policy, "degree_of_tearing")).toBe(false);
      expect(isClientVisibleField("birth_log", policy, "apgar_five_minute")).toBe(false);
    }
  });

  it("shares a family's own preferences back, and only those", () => {
    const visible = clientVisibleFieldKeys("care_plan", CARE_PLAN_SHAREABLE_POLICY);
    const withoutSignature = chartFieldKeys("care_plan").filter(
      (key) => !["doula_first_name", "doula_last_name", "doula_signature"].includes(key),
    );
    expect(visible).toEqual(withoutSignature);
    expect(visible).toContain("medication_code_word");
    expect(visible).not.toContain("doula_signature");
    expect(isClientVisibleField("care_plan", "staff_only", "medication_code_word")).toBe(false);
  });

  it("never hands the doula signature block to a family, under any policy", () => {
    for (const document of CHART_DOCUMENT_KEYS) {
      for (const policy of SHARE_POLICIES) {
        const visible = clientVisibleFieldKeys(document, policy);
        for (const key of ["doula_first_name", "doula_last_name", "doula_signature"]) {
          expect(visible, `${document}/${policy}/${key}`).not.toContain(key);
        }
      }
    }
  });

  it("never shares a prenatal note's medical flags", () => {
    const visible = clientVisibleFieldKeys("prenatal_visit", "preferences_shareable");
    for (const key of ["group_b_strep", "allergies", "past_birth_experiences"]) {
      expect(visible).not.toContain(key);
    }
  });

  it("recognises only the policies it defines", () => {
    expect(isSharePolicy("staff_only")).toBe(true);
    expect(isSharePolicy("public")).toBe(false);
    expect(isSharePolicy("client_visible")).toBe(false);
  });
});
