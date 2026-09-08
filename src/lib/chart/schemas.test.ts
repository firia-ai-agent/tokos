import { describe, expect, it } from "vitest";

import { BIRTH_LOG_GRID_ROWS, type ChartAnswers } from "./field-defs";
import {
  birthLogSignedSchema,
  chartAnswerSchema,
  missingRequiredFieldKeys,
  parseChartAnswers,
  prenatalVisitDraftSchema,
} from "./schemas";

/** A prenatal visit as a doula would leave it mid-visit: starred fields in, rest blank. */
const PRENATAL_DRAFT: ChartAnswers = {
  visit_date: "2026-09-15",
  client_first_name: "Jordan",
  client_last_name: "Ellis",
  estimated_due_date: "2026-09-29",
  partner_name: "Sam Rivera",
  care_provider_name: "Dr. A. Okonkwo",
  care_provider_practice: "Arlington OB",
  expected_birth_place: "Virginia Hospital Center",
  first_birth: "yes",
  concerns_labor_birth: "Wants to stay home as long as feels right.",
  concerns_postpartum: "",
  group_b_strep: "unknown",
  gestational_diabetes: "no",
  rh_negative: "no",
  allergies: "None known.",
  cultural_or_religious_rituals: "",
  reviewed_18_hour_clause: true,
};

/** A birth log filled to the point a doula could sign it. */
const BIRTH_LOG_SIGNED: ChartAnswers = {
  client_first_name: "Jordan",
  client_last_name: "Ellis",
  due_date: "2026-09-29",
  date_of_birth: "2026-09-27",
  time_of_birth: "04:12",
  birth_location: "Virginia Hospital Center",
  delivery_care_provider: "Dr. A. Okonkwo",
  other_care_providers: "",
  nurses: "N. Alvarez, RN",
  labor_began_at: "18:40",
  admission_dilation_effacement_station: "4 / 80% / -2 (as reported at admission)",
  spontaneous_rupture_of_membranes: "yes",
  rupture_location: "home",
  meconium_present: "no",
  first_stage_length: "9h",
  second_stage_length: "42m",
  third_stage_length: "11m",
  third_stage_complications: "",
  latched_before_doula_left: "yes",
  baby_gender: "girl",
  baby_name: "Wren",
  baby_weight: "7 lb 4 oz",
  baby_length: "20 in",
  doula_arrived_at: "22:15",
  doula_left_at: "07:00",
  doula_hours_at_birth: 8.75,
  labor_grid: [
    { time: "22:30", dilation: "5", effacement: "80", station: "-2" },
    { time: "00:30", dilation: "7", effacement: "90", station: "-1" },
    { time: "02:30", dilation: "complete", effacement: "100", station: "1" },
  ],
  interventions: ["intermittent_fh_monitoring", "heplock", "epidural", "vaginal_delivery"],
  pitocin_start_dilation_cm: "",
  degree_of_tearing: "1",
  newborn_care: ["vitamin_k", "erythromycin"],
  apgar_one_minute: 8,
  apgar_five_minute: 9,
  additional_events: "Skin to skin within a minute; first latch at 04:40.",
  doula_first_name: "Maya",
  doula_last_name: "Chen",
  doula_signature: "Maya Chen",
};

describe("chart answer schemas (TOK-44)", () => {
  it("round-trips a prenatal draft without changing an answer", () => {
    expect(parseChartAnswers("prenatal_visit", "draft", PRENATAL_DRAFT)).toEqual(PRENATAL_DRAFT);
  });

  it("round-trips a full birth log, grid and all", () => {
    const parsed = parseChartAnswers("birth_log", "signed", BIRTH_LOG_SIGNED);
    expect(parsed).toEqual(BIRTH_LOG_SIGNED);
    expect((parsed.labor_grid as unknown[]).length).toBe(3);
  });

  it("lets a draft be as unfinished as the doula left it", () => {
    expect(prenatalVisitDraftSchema().safeParse({ visit_date: "" }).success).toBe(true);
    expect(prenatalVisitDraftSchema().safeParse({}).success).toBe(true);
  });

  it("will not let a half-filled birth log be signed", () => {
    const unsigned = { ...BIRTH_LOG_SIGNED };
    delete unsigned.doula_signature;
    expect(birthLogSignedSchema().safeParse(unsigned).success).toBe(false);
    expect(missingRequiredFieldKeys("birth_log", unsigned)).toEqual(["doula_signature"]);
    expect(missingRequiredFieldKeys("birth_log", BIRTH_LOG_SIGNED)).toEqual([]);
  });

  it("names every starred field still blank, the way 'Show Missing Fields' does", () => {
    expect(missingRequiredFieldKeys("birth_log", {}).length).toBe(16);
    expect(missingRequiredFieldKeys("prenatal_visit", { visit_date: "" })).toContain("visit_date");
  });

  it("rejects an answer key no field def declares", () => {
    const strayKey = birthLogSignedSchema().safeParse({
      ...BIRTH_LOG_SIGNED,
      fundal_height_cm: "34",
    });
    expect(strayKey.success).toBe(false);
  });

  it("rejects an option nobody put on the form", () => {
    expect(
      chartAnswerSchema("birth_log", "draft").safeParse({ degree_of_tearing: "5" }).success,
    ).toBe(false);
    expect(
      chartAnswerSchema("care_plan", "draft").safeParse({ induction_methods: ["foley"] }).success,
    ).toBe(true);
    expect(
      chartAnswerSchema("care_plan", "draft").safeParse({ induction_methods: ["hypnosis"] })
        .success,
    ).toBe(false);
  });

  it("holds the grid to the sixteen rows on the page", () => {
    const row = { time: "01:00", dilation: "6", effacement: "80", station: "-1" };
    const full = Array.from({ length: BIRTH_LOG_GRID_ROWS }, () => row);
    expect(chartAnswerSchema("birth_log", "draft").safeParse({ labor_grid: full }).success).toBe(
      true,
    );
    expect(
      chartAnswerSchema("birth_log", "draft").safeParse({ labor_grid: [...full, row] }).success,
    ).toBe(false);
    expect(
      chartAnswerSchema("birth_log", "draft").safeParse({
        labor_grid: [{ time: "01:00", pulse: "88" }],
      }).success,
    ).toBe(false);
  });

  it("round-trips a care plan's preference clusters", () => {
    const plan: ChartAnswers = {
      early_labor_non_medical: ["labor_at_home", "birth_ball", "music"],
      early_labor_medical: ["intermittent_monitoring", "heparin_lock"],
      medication_code_word: "blue heron",
      birth_choices: ["delayed_cord_clamping", "baby_on_chest_immediately"],
      newborn_procedures: ["vitamin_k", "eye_ointment"],
      know_gender: "surprise",
      keeping_placenta: "yes",
      cord_blood_banking: "no",
      induction_methods: ["no_pitocin"],
      cesarean_preferences: ["partner_present", "doula_present", "clear_drape"],
    };
    expect(parseChartAnswers("care_plan", "draft", plan)).toEqual(plan);
  });
});
