import { describe, expect, it } from "vitest";

import {
  BIRTH_LOG_GRID_ROWS,
  CHART_DOCUMENTS,
  CHART_DOCUMENT_KEYS,
  chartField,
  chartFieldKeys,
  chartFields,
  clinicalFieldKeys,
  requiredFieldKeys,
  visitNoteDocumentKey,
  type ChartDocumentKey,
} from "./field-defs";

/**
 * The inventory, restated as keys only (TOK-44).
 *
 * This is the second source that catches drift: labels live in `field-defs`, and this list
 * says which live NOVA form line each key answers for. Deleting a key here to make a test
 * pass is deleting a question a doula fills in today — check the inventory file first:
 * /workspace/tokos-audit/dubsado-forms/BIRTH-LOG-FIELDS.md
 * /workspace/tokos-audit/dubsado-forms/PRENATAL-VISIT-FIELDS.md
 */
const BIRTH_LOG_INVENTORY: Record<string, string> = {
  "1 Client First Name": "client_first_name",
  "2 Client Last Name": "client_last_name",
  "3 Due date": "due_date",
  "4 Date of Birth": "date_of_birth",
  "5 Time of birth": "time_of_birth",
  "6 Location of Birth": "birth_location",
  "7 Name of Care Provider at Delivery": "delivery_care_provider",
  "8 Other care Providers": "other_care_providers",
  "9 Nurse(s)": "nurses",
  "10 Time labor began": "labor_began_at",
  "11 Dilation/Effacement/Station when admitted": "admission_dilation_effacement_station",
  "12 Spontaneous rupture of membranes?": "spontaneous_rupture_of_membranes",
  "13 Location?": "rupture_location",
  "14 Was meconium present?": "meconium_present",
  "15 Approx length first stage": "first_stage_length",
  "16 Approx length second stage": "second_stage_length",
  "17 Approx length third stage": "third_stage_length",
  "18 Any third stage complications?": "third_stage_complications",
  "19 Did baby latch prior to you leaving?": "latched_before_doula_left",
  "20 Gender": "baby_gender",
  "21 Baby's Name": "baby_name",
  "22 Weight": "baby_weight",
  "23 Length": "baby_length",
  "24 Time Doula arrived": "doula_arrived_at",
  "25 Time Doula left": "doula_left_at",
  "26 Hours spent with client at birth": "doula_hours_at_birth",
  "grid 16 rows": "labor_grid",
  interventions: "interventions",
  "CM dilated when Pitocin started": "pitocin_start_dilation_cm",
  "Degree of tearing": "degree_of_tearing",
  "newborn care": "newborn_care",
  "APGAR 1 min": "apgar_one_minute",
  "APGAR 5 min": "apgar_five_minute",
  "Additional events": "additional_events",
  "signature first": "doula_first_name",
  "signature last": "doula_last_name",
  signature: "doula_signature",
};

/** Starred on the live Birth Log — required to sign, not to draft. */
const BIRTH_LOG_STARRED = [
  "client_first_name",
  "client_last_name",
  "due_date",
  "date_of_birth",
  "time_of_birth",
  "birth_location",
  "delivery_care_provider",
  "labor_began_at",
  "admission_dilation_effacement_station",
  "spontaneous_rupture_of_membranes",
  "doula_arrived_at",
  "doula_left_at",
  "doula_hours_at_birth",
];

/** Every checkbox on the Birth Log intervention list. */
const INTERVENTION_OPTIONS = [
  "continuous_fh_monitoring",
  "intermittent_fh_monitoring",
  "internal_scalp_electrode",
  "iupc",
  "heplock",
  "iv",
  "srom",
  "arom",
  "amnioinfusion",
  "prostaglandin",
  "cytotec",
  "cervidil",
  "foley_cooks",
  "pitocin_induction",
  "pitocin_augmentation",
  "other_meds",
  "narcotic",
  "epidural",
  "forceps",
  "vacuum",
  "episiotomy",
  "vaginal_delivery",
  "surgical_delivery",
];

const NEWBORN_CARE_OPTIONS = [
  "vitamin_k",
  "erythromycin",
  "hep_b",
  "c_pap",
  "resuscitation",
  "nicu_transfer",
];

/** The prenatal form's visit half — logistics, history, medical flags, checklist. */
const PRENATAL_VISIT_INVENTORY: Record<string, string> = {
  "1 Date of this prenatal visit": "visit_date",
  "2 Name first": "client_first_name",
  "2 Name last": "client_last_name",
  "3 Home Address street": "home_address_street",
  "3 Home Address city": "home_address_city",
  "3 Home Address state": "home_address_state",
  "3 Home Address zip": "home_address_zip",
  "4 Estimated Due Date": "estimated_due_date",
  "5 What is parking like around your home?": "parking_notes",
  "6 Name of Partner": "partner_name",
  "7 Name of Care Provider": "care_provider_name",
  "8 Practice": "care_provider_practice",
  "9 Who will be attending your birth?": "birth_attendees",
  "10 Expected Place of birth": "expected_birth_place",
  "11 Partner — how do you see yourself during the Birth?": "partner_role_expectation",
  "12 Is this your first birth?": "first_birth",
  "13 Past birth experiences": "past_birth_experiences",
  "14 How long do you plan on laboring at home?": "laboring_at_home_plan",
  "15 concerns labor": "concerns_labor_birth",
  "15 concerns postpartum": "concerns_postpartum",
  "15 concerns other": "concerns_other",
  "Group B Strep": "group_b_strep",
  "Gestational Diabetes": "gestational_diabetes",
  "RH -": "rh_negative",
  "Other medical conditions affecting birth?": "other_medical_conditions",
  "LEEP / cervical surgery?": "leep_or_cervical_surgery",
  "LEEP explain": "leep_or_cervical_surgery_detail",
  "Allergies medications/food/latex": "allergies",
  "Expectations for birth team": "birth_team_expectations",
  "Where do you manifest stress": "stress_and_relaxation",
  "Pets or other children?": "pets_or_children_plan",
  "Childbirth class location?": "childbirth_class",
  "Exercise regularly?": "exercises_regularly",
  "Exercise/Frequency": "exercise_frequency",
  "Chiropractor?": "sees_chiropractor",
  "Help with postpartum meals/housework?": "postpartum_help",
  "Cultural/religious rituals or concerns": "cultural_or_religious_rituals",
  "FOR SOLO ONLY preferred back-up": "solo_backup_preference",
  "FOR HOMEBIRTH ONLY supplies": "homebirth_supplies",
  "FOR HOMEBIRTH ONLY waterbirth": "homebirth_waterbirth",
  "checklist 18 hour clause": "reviewed_18_hour_clause",
  "checklist when to call doula": "reviewed_when_to_call",
  "signature first": "doula_first_name",
  "signature last": "doula_last_name",
  signature: "doula_signature",
};

/** The prenatal form's preference half becomes the care plan. */
const CARE_PLAN_INVENTORY: Record<string, string> = {
  "Early Labor — Non-Medical Choices": "early_labor_non_medical",
  "Early Labor — Medical Choices": "early_labor_medical",
  "16 Code word for medication/epidural?": "medication_code_word",
  "Birth — Choices for Birth": "birth_choices",
  "Newborn procedures": "newborn_procedures",
  "Know gender?": "know_gender",
  "Name?": "baby_name",
  "Circumcising if boy?": "circumcising",
  "If yes where/when": "circumcising_detail",
  "Keeping placenta?": "keeping_placenta",
  "Encapsulator hired?": "encapsulator_hired",
  "Cord blood banking?": "cord_blood_banking",
  "Induction methods": "induction_methods",
  "C-section prefs": "cesarean_preferences",
  "signature first": "doula_first_name",
  "signature last": "doula_last_name",
  signature: "doula_signature",
};

const INVENTORIES: Array<[ChartDocumentKey, Record<string, string>]> = [
  ["birth_log", BIRTH_LOG_INVENTORY],
  ["prenatal_visit", PRENATAL_VISIT_INVENTORY],
  ["care_plan", CARE_PLAN_INVENTORY],
];

describe("chart field defs vs the Dubsado inventories (TOK-44)", () => {
  it.each(INVENTORIES)("covers every %s inventory line", (document, inventory) => {
    const keys = chartFieldKeys(document);
    for (const [line, key] of Object.entries(inventory)) {
      expect(keys, `inventory line "${line}" has no field def`).toContain(key);
    }
  });

  it.each(INVENTORIES)("defines nothing in %s that the inventory did not ask for", (
    document,
    inventory,
  ) => {
    const inventoried = new Set(Object.values(inventory));
    for (const key of chartFieldKeys(document)) {
      expect(inventoried, `field "${key}" is not on the inventory`).toContain(key);
    }
  });

  it("keeps the prenatal split clean — no key answers for two documents", () => {
    const visit = new Set(chartFieldKeys("prenatal_visit"));
    const shared = chartFieldKeys("care_plan").filter((key) => visit.has(key));
    // The signature block is the one honest overlap: both documents are signed.
    expect(shared).toEqual(["doula_first_name", "doula_last_name", "doula_signature"]);
  });

  it("carries the full birth log — no deferred clinical fields (F8)", () => {
    const interventions = chartField("birth_log", "interventions");
    expect(interventions?.options?.map((option) => option.value)).toEqual(INTERVENTION_OPTIONS);

    const newborn = chartField("birth_log", "newborn_care");
    expect(newborn?.options?.map((option) => option.value)).toEqual(NEWBORN_CARE_OPTIONS);

    const tearing = chartField("birth_log", "degree_of_tearing");
    expect(tearing?.options?.map((option) => option.value)).toEqual(["0", "1", "2", "3", "4"]);
  });

  it("charts the grid the way the paper does — 16 rows, four columns", () => {
    const grid = chartField("birth_log", "labor_grid");
    expect(grid?.type).toBe("grid");
    expect(grid?.rows).toBe(BIRTH_LOG_GRID_ROWS);
    expect(BIRTH_LOG_GRID_ROWS).toBe(16);
    expect(grid?.columns?.map((column) => column.key)).toEqual([
      "time",
      "dilation",
      "effacement",
      "station",
    ]);
    const station = grid?.columns?.find((column) => column.key === "station");
    expect(station?.options?.map((option) => option.value)).toEqual([
      "-3",
      "-2",
      "-1",
      "0",
      "1",
      "2",
      "3",
    ]);
    const dilation = grid?.columns?.find((column) => column.key === "dilation");
    expect(dilation?.options?.at(-1)?.value).toBe("complete");
  });

  it("stars exactly the fields the live birth log stars", () => {
    expect(requiredFieldKeys("birth_log").sort()).toEqual(
      [...BIRTH_LOG_STARRED, "doula_first_name", "doula_last_name", "doula_signature"].sort(),
    );
  });

  it("marks the clinical grid clinical, and the family's own answers not", () => {
    const clinical = clinicalFieldKeys("birth_log");
    for (const key of [
      "labor_grid",
      "interventions",
      "degree_of_tearing",
      "apgar_one_minute",
      "apgar_five_minute",
      "admission_dilation_effacement_station",
    ]) {
      expect(clinical, `${key} must be clinical`).toContain(key);
    }
    // Preferences are the family's own words — flagging them clinical would make the one
    // shareable document unshareable.
    expect(clinicalFieldKeys("care_plan")).toEqual([]);
  });

  it("says out loud where dilation and station come from (Faith K8)", () => {
    for (const key of ["admission_dilation_effacement_station", "labor_grid", "interventions"]) {
      expect(chartField("birth_log", key)?.asReported).toBe(true);
    }
  });

  it.each(CHART_DOCUMENT_KEYS)("gives %s unique keys and a label for every field", (document) => {
    const fields = chartFields(document);
    expect(new Set(fields.map((field) => field.key)).size).toBe(fields.length);
    for (const field of fields) {
      expect(field.label.trim().length).toBeGreaterThan(0);
      expect(field.key).toMatch(/^[a-z][a-z0-9_]*$/);
      if (field.type === "select" || field.type === "multiselect") {
        expect(field.options?.length, `${field.key} needs options`).toBeGreaterThan(0);
      }
    }
  });

  it("routes both visit note kinds to a template", () => {
    expect(visitNoteDocumentKey("prenatal")).toBe("prenatal_visit");
    expect(visitNoteDocumentKey("postpartum")).toBe("postpartum_visit");
    expect(CHART_DOCUMENTS.postpartum_visit.table).toBe("visit_notes");
    expect(CHART_DOCUMENTS.birth_log.table).toBe("birth_logs");
    expect(CHART_DOCUMENTS.care_plan.table).toBe("care_plans");
  });
});
