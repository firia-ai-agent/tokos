import { describe, expect, it } from "vitest";

import {
  clientVisibleAnswers,
  formatChartAnswer,
  passportEntries,
  passportSections,
} from "./passport";
import { chartField, clinicalFieldKeys } from "./field-defs";
import { CARE_PLAN_SHAREABLE_POLICY, SHARE_POLICIES } from "./share-policy";

const carePlanAnswers = {
  early_labor_non_medical: ["labor_at_home", "birth_ball", "music"],
  early_labor_medical: ["intermittent_monitoring", "no_vaginal_checks"],
  medication_code_word: "pineapple",
  birth_choices: ["delayed_cord_clamping", "baby_on_chest_immediately"],
  newborn_procedures: ["vitamin_k"],
  know_gender: "surprise",
  circumcising: "no",
  doula_first_name: "Maya",
  doula_last_name: "Chen",
  doula_signature: "Maya Chen",
};

/** A signed birth log with the whole clinical grid filled in — the worst case. */
const birthLogAnswers = {
  client_first_name: "Jordan",
  birth_location: "Virginia Hospital Center",
  baby_name: "Wren",
  baby_weight: "7 lb 4 oz",
  admission_dilation_effacement_station: "4 / 80% / -1",
  labor_grid: [{ time: "02:10", dilation: "6", effacement: "90", station: "-1" }],
  interventions: [{ time: "03:00", intervention: "epidural" }],
  degree_of_tearing: "second",
  apgar_one_minute: 8,
  apgar_five_minute: 9,
  doula_first_name: "Maya",
  doula_last_name: "Chen",
  doula_signature: "Maya Chen",
};

describe("passport sections (TOK-45)", () => {
  it("hands a family their own preferences back, grouped as the form asked them", () => {
    const sections = passportSections("care_plan", CARE_PLAN_SHAREABLE_POLICY, carePlanAnswers);
    const keys = sections.flatMap((section) => section.fields.map((field) => field.key));
    expect(keys).toContain("medication_code_word");
    expect(keys).toContain("early_labor_non_medical");

    const codeWord = sections
      .flatMap((section) => section.fields)
      .find((field) => field.key === "medication_code_word");
    expect(codeWord?.label).toBe("Code word for medication / epidural?");
    expect(codeWord?.value).toBe("pineapple");
  });

  it("says option labels out loud rather than storage values", () => {
    const sections = passportSections("care_plan", CARE_PLAN_SHAREABLE_POLICY, carePlanAnswers);
    const choices = sections
      .flatMap((section) => section.fields)
      .find((field) => field.key === "early_labor_non_medical");
    expect(choices?.value).toBe("Labor at home · Birth ball · Music");

    const gender = sections
      .flatMap((section) => section.fields)
      .find((field) => field.key === "know_gender");
    expect(gender?.value).toBe("Surprise");
  });

  it("drops unanswered fields and the groups that empty out", () => {
    const sections = passportSections("care_plan", CARE_PLAN_SHAREABLE_POLICY, {
      medication_code_word: "pineapple",
    });
    expect(sections).toHaveLength(1);
    expect(sections[0].fields.map((field) => field.key)).toEqual(["medication_code_word"]);
  });

  it("shows a family nothing at all while the plan is staff-only", () => {
    expect(passportSections("care_plan", "staff_only", carePlanAnswers)).toEqual([]);
  });

  it("hides the doula signature / attestation group from the family", () => {
    const sections = passportSections("care_plan", CARE_PLAN_SHAREABLE_POLICY, carePlanAnswers);
    expect(sections.map((section) => section.key)).not.toContain("signature");
    const keys = sections.flatMap((section) => section.fields.map((field) => field.key));
    expect(keys).not.toContain("doula_first_name");
    expect(keys).not.toContain("doula_last_name");
    expect(keys).not.toContain("doula_signature");
    const text = JSON.stringify(sections);
    expect(text).not.toContain("Digital signature");
    expect(text).not.toContain("Maya Chen");
  });

  it("softens clinical chart group headings on the family Passport", () => {
    const sections = passportSections("care_plan", CARE_PLAN_SHAREABLE_POLICY, carePlanAnswers);
    const medical = sections.find((section) => section.key === "early_labor_medical");
    const newborn = sections.find((section) => section.key === "newborn_procedures");
    expect(medical?.label).toBe("Early labor preferences");
    expect(newborn?.label).toBe("Newborn care preferences");
    expect(medical?.fields.find((f) => f.key === "early_labor_medical")?.label).toBe(
      "Early labor preferences",
    );
    expect(newborn?.fields.find((f) => f.key === "newborn_procedures")?.label).toBe(
      "Newborn care preferences",
    );
    const text = JSON.stringify(sections);
    expect(text).not.toContain("Early labor — medical choices");
    expect(text).not.toContain("Newborn procedures");
    // Preference keys themselves remain — intentional family shares.
    expect(medical?.fields.map((f) => f.key)).toContain("early_labor_medical");
    expect(medical?.fields.map((f) => f.key)).toContain("medication_code_word");
    expect(newborn?.fields.map((f) => f.key)).toEqual(["newborn_procedures"]);
  });
});

describe("birth log clinical strip (TOK-45 — S0)", () => {
  it("never renders a clinical field to a family, under any policy", () => {
    const clinical = clinicalFieldKeys("birth_log");
    expect(clinical).toContain("labor_grid");
    expect(clinical).toContain("degree_of_tearing");
    expect(clinical).toContain("apgar_five_minute");
    expect(clinical).toContain("interventions");

    for (const policy of SHARE_POLICIES) {
      const rendered = passportSections("birth_log", policy, birthLogAnswers);
      const keys = rendered.flatMap((section) => section.fields.map((field) => field.key));
      for (const key of clinical) {
        expect(keys, `${key} leaked under ${policy}`).not.toContain(key);
      }
      const text = JSON.stringify(rendered);
      expect(text).not.toContain("80%");
      expect(text).not.toContain("second");
      expect(text).not.toContain("epidural");
    }
  });

  it("leaves the plain header when a doula shares a summary", () => {
    const sections = passportSections("birth_log", "shared_summary", birthLogAnswers);
    const keys = sections.flatMap((section) => section.fields.map((field) => field.key));
    expect(keys).toContain("birth_location");
    expect(keys).toContain("baby_name");
    expect(keys).not.toContain("admission_dilation_effacement_station");
    expect(keys).not.toContain("doula_signature");
    expect(sections.map((section) => section.key)).not.toContain("signature");
  });

  it("draws nothing for a grid even if one were handed to it", () => {
    const grid = chartField("birth_log", "labor_grid");
    expect(grid?.type).toBe("grid");
    expect(formatChartAnswer(grid!, birthLogAnswers.labor_grid)).toBe("");
  });

  it("strips an export for a family the same way", () => {
    const answers = clientVisibleAnswers("birth_log", "shared_summary", birthLogAnswers);
    for (const key of clinicalFieldKeys("birth_log")) {
      expect(answers, key).not.toHaveProperty(key);
    }
    expect(answers.baby_name).toBe("Wren");
  });
});

describe("passportEntries (TOK-45)", () => {
  const signed = new Date("2026-08-01T15:00:00.000Z");

  it("keeps a signed, shared care plan", () => {
    const entries = passportEntries([
      {
        id: "care-plan-1",
        document: "care_plan",
        status: "signed",
        sharePolicy: CARE_PLAN_SHAREABLE_POLICY,
        signedAt: signed,
        answers: carePlanAnswers,
      },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("Birth preferences & care plan");
    expect(entries[0].signedAt).toBe(signed);
  });

  it("drops a plan that is shared but not signed, and one signed but not shared", () => {
    expect(
      passportEntries([
        {
          id: "draft",
          document: "care_plan",
          status: "draft",
          sharePolicy: CARE_PLAN_SHAREABLE_POLICY,
          signedAt: null,
          answers: carePlanAnswers,
        },
        {
          id: "closed",
          document: "care_plan",
          status: "signed",
          sharePolicy: "staff_only",
          signedAt: signed,
          answers: carePlanAnswers,
        },
      ]),
    ).toEqual([]);
  });

  it("carries a shared birth log with the clinical grid already gone", () => {
    const entries = passportEntries([
      {
        id: "birth-log-1",
        document: "birth_log",
        status: "signed",
        sharePolicy: "shared_summary",
        signedAt: signed,
        answers: birthLogAnswers,
      },
    ]);
    const keys = entries
      .flatMap((entry) => entry.sections)
      .flatMap((section) => section.fields.map((field) => field.key));
    for (const key of clinicalFieldKeys("birth_log")) {
      expect(keys, key).not.toContain(key);
    }
  });
});
