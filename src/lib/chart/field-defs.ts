/**
 * Every chart field Tokos knows about, declared once (TOK-44).
 *
 * This file is the single source for chart field keys, labels, types, option lists and
 * clinical flags. Tables store answers as jsonb keyed by `ChartFieldDef.key`, zod
 * validators are derived from these defs (`lib/chart/schemas`), and TOK-43's UI renders
 * from them. A label typed anywhere else — a page, a query, a seed, a test fixture — is a
 * second source of truth for what NOVA's forms say, and the next inventory change will
 * only fix one of them.
 *
 * Ground truth is the live NOVA Dubsado inventory:
 *   /workspace/tokos-audit/dubsado-forms/BIRTH-LOG-FIELDS.md
 *   /workspace/tokos-audit/dubsado-forms/PRENATAL-VISIT-FIELDS.md
 * mapped inventory-line to key in `docs/chart-schema-map.md`. Keys are stable: they are
 * written into rows, so rename a label freely and never a key.
 *
 * Scope note (F1/F8, notion-ready-reconcile.md): the full Birth Log field set ships —
 * dilation/effacement/station, the 16-row grid, interventions, tearing, APGARs, newborn
 * care. Those are support-documentation parity with the form NOVA fills today, not a
 * midwife EMR, and they are `clinical: true`, which is what keeps them off every
 * client-facing surface (`lib/chart/share-policy`).
 */

export const CHART_FIELD_TYPES = [
  "text",
  "textarea",
  "date",
  "time",
  "number",
  "boolean",
  "select",
  "multiselect",
  "grid",
  "signature",
] as const;

export type ChartFieldType = (typeof CHART_FIELD_TYPES)[number];

export type ChartFieldOption = { value: string; label: string };

export type ChartFieldDef = {
  /** Stable storage key. Written into `answers` jsonb — never rename. */
  key: string;
  /** The only place this question's wording lives. */
  label: string;
  type: ChartFieldType;
  /** Starred on the Dubsado form: required to sign, never required to draft. */
  required?: boolean;
  options?: readonly ChartFieldOption[];
  /** Grid columns, each a field def in its own right. */
  columns?: readonly ChartFieldDef[];
  /** Fixed row count for a grid (the Birth Log grid is 16 rows on paper). */
  rows?: number;
  /**
   * Clinical observation. Staff-only under every share policy, forever — a family reading
   * their own dilation curve or degree of tearing out of context is the harm this flag
   * exists to prevent.
   */
  clinical?: boolean;
  /**
   * Documented as reported (hospital/RN report or what the doula was told), not an exam
   * Tokos performed. Faith K8 — UI copy must carry this, so it lives with the field.
   */
  asReported?: boolean;
  help?: string;
};

export type ChartFieldGroup = {
  key: string;
  label: string;
  fields: readonly ChartFieldDef[];
};

export type ChartDocumentDef = {
  key: ChartDocumentKey;
  label: string;
  /** Which table stores rows of this document. */
  table: "visit_notes" | "birth_logs" | "care_plans";
  groups: readonly ChartFieldGroup[];
};

const o = (value: string, label: string): ChartFieldOption => ({ value, label });

const YES_NO = [o("yes", "Yes"), o("no", "No")] as const;
const YES_NO_UNKNOWN = [...YES_NO, o("unknown", "Unknown")] as const;

/** The doula who completed the form signs it; signing locks the row. */
const signatureGroup = (key: string): ChartFieldGroup => ({
  key,
  label: "Signature",
  fields: [
    { key: "doula_first_name", label: "Doula first name", type: "text", required: true },
    { key: "doula_last_name", label: "Doula last name", type: "text", required: true },
    {
      key: "doula_signature",
      label: "Digital signature of doula completing this record",
      type: "signature",
      required: true,
      help: "Once signed, this record is no longer editable. Corrections are a new version.",
    },
  ],
});

// ---------------------------------------------------------------------------
// Birth Log — BIRTH-LOG-FIELDS.md, in form order.
// ---------------------------------------------------------------------------

/** 16 rows on the paper form; the grid validator holds us to it. */
export const BIRTH_LOG_GRID_ROWS = 16;

const DILATION_OPTIONS: readonly ChartFieldOption[] = [
  ...Array.from({ length: 10 }, (_, cm) => o(String(cm), `${cm}`)),
  o("complete", "Complete"),
];

/** Effacement is charted in tens, 0–100%. */
const EFFACEMENT_OPTIONS: readonly ChartFieldOption[] = Array.from(
  { length: 11 },
  (_, step) => o(String(step * 10), `${step * 10}%`),
);

/** Station runs −3 to +3. Values keep their sign so the key sorts and reads the same. */
const STATION_OPTIONS: readonly ChartFieldOption[] = Array.from(
  { length: 7 },
  (_, step) => {
    const station = step - 3;
    return o(String(station), station > 0 ? `+${station}` : `${station}`);
  },
);

const BIRTH_LOG_GROUPS: readonly ChartFieldGroup[] = [
  {
    key: "header",
    label: "Header / identity",
    fields: [
      { key: "client_first_name", label: "Client first name", type: "text", required: true },
      { key: "client_last_name", label: "Client last name", type: "text", required: true },
      { key: "due_date", label: "Due date", type: "date", required: true },
      { key: "date_of_birth", label: "Date of birth", type: "date", required: true },
      { key: "time_of_birth", label: "Time of birth", type: "time", required: true },
      { key: "birth_location", label: "Location of birth", type: "text", required: true },
      {
        key: "delivery_care_provider",
        label: "Name of care provider at delivery",
        type: "text",
        required: true,
      },
      { key: "other_care_providers", label: "Other care providers", type: "text" },
      { key: "nurses", label: "Nurse(s)", type: "text" },
    ],
  },
  {
    key: "labor_timeline",
    label: "Labor timeline",
    fields: [
      { key: "labor_began_at", label: "Time labor began", type: "time", required: true },
      {
        key: "admission_dilation_effacement_station",
        label: "Dilation / effacement / station when admitted",
        type: "text",
        required: true,
        clinical: true,
        asReported: true,
        help: "As reported at admission — not an exam performed by the doula.",
      },
      {
        key: "spontaneous_rupture_of_membranes",
        label: "Spontaneous rupture of membranes?",
        type: "select",
        required: true,
        options: YES_NO,
        clinical: true,
      },
      {
        key: "rupture_location",
        label: "Location?",
        type: "select",
        options: [o("home", "Home"), o("car", "Car"), o("place_of_birth", "Place of birth")],
        clinical: true,
      },
      {
        key: "meconium_present",
        label: "Was meconium present?",
        type: "select",
        options: [o("no", "No"), o("yes_light", "Yes — light"), o("yes_heavy", "Yes — heavy")],
        clinical: true,
      },
      {
        key: "first_stage_length",
        label: "Approximate length of first stage",
        type: "text",
        clinical: true,
      },
      {
        key: "second_stage_length",
        label: "Approximate length of second stage (pushing)",
        type: "text",
        clinical: true,
      },
      {
        key: "third_stage_length",
        label: "Approximate length of third stage (placenta)",
        type: "text",
        clinical: true,
      },
      {
        key: "third_stage_complications",
        label: "Any third stage complications? If yes, explain",
        type: "textarea",
        clinical: true,
      },
      {
        key: "latched_before_doula_left",
        label: "Did baby latch prior to you leaving?",
        type: "select",
        options: [
          o("yes", "Yes"),
          o("no", "No"),
          o("chose_not_to_breastfeed", "Parent chose not to breastfeed"),
        ],
        clinical: true,
      },
    ],
  },
  {
    key: "baby",
    label: "Baby",
    fields: [
      {
        key: "baby_gender",
        label: "Gender",
        type: "select",
        options: [o("boy", "Boy"), o("girl", "Girl")],
      },
      { key: "baby_name", label: "Baby's name", type: "text" },
      { key: "baby_weight", label: "Weight", type: "text" },
      { key: "baby_length", label: "Length", type: "text" },
    ],
  },
  {
    key: "doula_time",
    label: "Doula time",
    fields: [
      { key: "doula_arrived_at", label: "Time doula arrived", type: "time", required: true },
      { key: "doula_left_at", label: "Time doula left", type: "time", required: true },
      {
        key: "doula_hours_at_birth",
        label: "Hours spent with client at birth",
        type: "number",
        required: true,
      },
    ],
  },
  {
    key: "labor_grid",
    label: "Birth log grid",
    fields: [
      {
        key: "labor_grid",
        label: "Birth log grid",
        type: "grid",
        rows: BIRTH_LOG_GRID_ROWS,
        clinical: true,
        asReported: true,
        help: "Charted as reported by the birth team — never client-visible.",
        columns: [
          { key: "time", label: "Time", type: "time" },
          { key: "dilation", label: "Dilation", type: "select", options: DILATION_OPTIONS },
          { key: "effacement", label: "Effacement", type: "select", options: EFFACEMENT_OPTIONS },
          { key: "station", label: "Station", type: "select", options: STATION_OPTIONS },
        ],
      },
    ],
  },
  {
    key: "interventions",
    label: "Interventions",
    fields: [
      {
        key: "interventions",
        label: "Interventions",
        type: "multiselect",
        clinical: true,
        asReported: true,
        options: [
          o("continuous_fh_monitoring", "Continuous FH monitoring"),
          o("intermittent_fh_monitoring", "Intermittent FH monitoring"),
          o("internal_scalp_electrode", "Internal scalp electrode"),
          o("iupc", "IUPC"),
          o("heplock", "Heplock"),
          o("iv", "IV"),
          o("srom", "SROM"),
          o("arom", "AROM"),
          o("amnioinfusion", "Amnioinfusion"),
          o("prostaglandin", "Prostaglandin"),
          o("cytotec", "Cytotec"),
          o("cervidil", "Cervidil"),
          o("foley_cooks", "Foley / Cook's"),
          o("pitocin_induction", "Pitocin induction"),
          o("pitocin_augmentation", "Pitocin augmentation"),
          o("other_meds", "Other meds"),
          o("narcotic", "Narcotic"),
          o("epidural", "Epidural"),
          o("forceps", "Forceps"),
          o("vacuum", "Vacuum"),
          o("episiotomy", "Episiotomy"),
          o("vaginal_delivery", "Vaginal delivery"),
          o("surgical_delivery", "Surgical delivery"),
        ],
      },
      {
        key: "pitocin_start_dilation_cm",
        label: "CM dilated when Pitocin started",
        type: "text",
        clinical: true,
        asReported: true,
      },
      {
        key: "degree_of_tearing",
        label: "Degree of tearing",
        type: "select",
        clinical: true,
        asReported: true,
        options: Array.from({ length: 5 }, (_, degree) => o(String(degree), `${degree}`)),
      },
    ],
  },
  {
    key: "newborn_care",
    label: "Newborn care",
    fields: [
      {
        key: "newborn_care",
        label: "Newborn care",
        type: "multiselect",
        clinical: true,
        options: [
          o("vitamin_k", "Vitamin K"),
          o("erythromycin", "Erythromycin"),
          o("hep_b", "Hep B"),
          o("c_pap", "C Pap"),
          o("resuscitation", "Resuscitation"),
          o("nicu_transfer", "NICU transfer"),
        ],
      },
      { key: "apgar_one_minute", label: "APGAR 1 minute", type: "number", clinical: true },
      { key: "apgar_five_minute", label: "APGAR 5 minute", type: "number", clinical: true },
      { key: "additional_events", label: "Additional events", type: "textarea", clinical: true },
    ],
  },
  signatureGroup("signature"),
];

// ---------------------------------------------------------------------------
// Prenatal visit note — PRENATAL-VISIT-FIELDS.md.
//
// The Dubsado form is one long page that mixes the visit record with the family's birth
// preferences. Tokos splits it where the two halves actually diverge: what the doula
// documented about this visit stays on the visit note, and the preference clusters become
// the care plan, which is the half that can ever be handed back to a family (Faith K1).
// Together the two documents cover the inventory once, with no key in both.
// ---------------------------------------------------------------------------

const PRENATAL_VISIT_GROUPS: readonly ChartFieldGroup[] = [
  {
    key: "visit",
    label: "Visit",
    fields: [
      { key: "visit_date", label: "Date of this prenatal visit", type: "date", required: true },
      { key: "client_first_name", label: "First name", type: "text" },
      { key: "client_last_name", label: "Last name", type: "text" },
      { key: "home_address_street", label: "Home address — street", type: "text" },
      { key: "home_address_city", label: "Home address — city", type: "text" },
      { key: "home_address_state", label: "Home address — state", type: "text" },
      { key: "home_address_zip", label: "Home address — ZIP", type: "text" },
      { key: "estimated_due_date", label: "Estimated due date", type: "date" },
      { key: "parking_notes", label: "What is parking like around your home?", type: "textarea" },
      { key: "partner_name", label: "Name of partner", type: "text" },
      { key: "care_provider_name", label: "Name of care provider", type: "text" },
      { key: "care_provider_practice", label: "Practice", type: "text" },
      {
        key: "birth_attendees",
        label: "Who will be attending your birth? What role will they play?",
        type: "textarea",
      },
      { key: "expected_birth_place", label: "Expected place of birth", type: "text" },
      {
        key: "partner_role_expectation",
        label: "Partner — how do you see yourself during the birth?",
        type: "textarea",
        help: "Hands-on, standoffish, aversions to blood or needles…",
      },
      {
        key: "first_birth",
        label: "Is this your first birth?",
        type: "select",
        required: true,
        options: YES_NO,
      },
      {
        key: "past_birth_experiences",
        label: "Past birth experiences (if applicable)",
        type: "textarea",
        clinical: true,
      },
      {
        key: "laboring_at_home_plan",
        label:
          "How long do you plan on laboring at home? Would you like your doula to join you there?",
        type: "textarea",
      },
      { key: "concerns_labor_birth", label: "Concerns about labor & birth", type: "textarea" },
      { key: "concerns_postpartum", label: "Concerns about after-care", type: "textarea" },
      { key: "concerns_other", label: "Other concerns", type: "textarea" },
    ],
  },
  {
    key: "medical",
    label: "Medical conditions",
    fields: [
      {
        key: "group_b_strep",
        label: "Group B Strep",
        type: "select",
        required: true,
        options: YES_NO_UNKNOWN,
        clinical: true,
        asReported: true,
      },
      {
        key: "gestational_diabetes",
        label: "Gestational diabetes",
        type: "select",
        required: true,
        options: YES_NO_UNKNOWN,
        clinical: true,
        asReported: true,
      },
      {
        key: "rh_negative",
        label: "RH negative",
        type: "select",
        required: true,
        options: YES_NO_UNKNOWN,
        clinical: true,
        asReported: true,
      },
      {
        key: "other_medical_conditions",
        label: "Other medical conditions affecting birth?",
        type: "textarea",
        clinical: true,
        asReported: true,
      },
      {
        key: "leep_or_cervical_surgery",
        label: "LEEP or cervical surgery?",
        type: "select",
        options: YES_NO,
        clinical: true,
        asReported: true,
      },
      {
        key: "leep_or_cervical_surgery_detail",
        label: "If yes, explain",
        type: "textarea",
        clinical: true,
        asReported: true,
      },
      {
        key: "allergies",
        label: "Allergies — medications, food, latex",
        type: "textarea",
        required: true,
        clinical: true,
        asReported: true,
      },
    ],
  },
  {
    key: "support",
    label: "Support & daily life",
    fields: [
      { key: "birth_team_expectations", label: "Expectations for birth team", type: "textarea" },
      {
        key: "stress_and_relaxation",
        label: "Where do you manifest stress, and what helps you relax?",
        type: "textarea",
      },
      {
        key: "pets_or_children_plan",
        label: "Pets or other children? Plans for them in labor?",
        type: "textarea",
      },
      { key: "childbirth_class", label: "Childbirth class location?", type: "text" },
      { key: "exercises_regularly", label: "Exercise regularly?", type: "select", options: YES_NO },
      { key: "exercise_frequency", label: "Exercise / frequency", type: "text" },
      { key: "sees_chiropractor", label: "Chiropractor?", type: "select", options: YES_NO },
      {
        key: "postpartum_help",
        label: "Help with postpartum meals or housework?",
        type: "select",
        options: YES_NO,
      },
      {
        key: "cultural_or_religious_rituals",
        label: "Cultural or religious rituals or concerns",
        type: "textarea",
        required: true,
      },
      {
        key: "solo_backup_preference",
        label: "For solo only: preferred back-up",
        type: "text",
      },
      {
        key: "homebirth_supplies",
        label: "For homebirth only: supplies box, towels, trash, laundry",
        type: "textarea",
      },
      {
        key: "homebirth_waterbirth",
        label: "For homebirth only: waterbirth, and who sets up the pool",
        type: "textarea",
      },
    ],
  },
  {
    key: "doula_checklist",
    label: "Doula checklist",
    fields: [
      { key: "reviewed_18_hour_clause", label: "18 hour clause reviewed", type: "boolean" },
      {
        key: "reviewed_when_to_call",
        label: "When to call the doula / on-call line reviewed",
        type: "boolean",
      },
    ],
  },
  signatureGroup("signature"),
];

/**
 * Postpartum visit notes share the `visit_notes` table and the sign→lock rules, but the
 * NOVA postpartum form has not been inventoried yet (research R1). Rather than invent
 * clinical questions no doula asked for, the template holds the visit spine only and fills
 * in when the inventory lands.
 */
const POSTPARTUM_VISIT_GROUPS: readonly ChartFieldGroup[] = [
  {
    key: "visit",
    label: "Visit",
    fields: [
      { key: "visit_date", label: "Date of this postpartum visit", type: "date", required: true },
      { key: "visit_summary", label: "Visit summary", type: "textarea", clinical: true },
    ],
  },
  signatureGroup("signature"),
];

// ---------------------------------------------------------------------------
// Care plan — the preference clusters of the prenatal form.
// ---------------------------------------------------------------------------

const CARE_PLAN_GROUPS: readonly ChartFieldGroup[] = [
  {
    key: "early_labor_non_medical",
    label: "Early labor — non-medical choices",
    fields: [
      {
        key: "early_labor_non_medical",
        label: "Early labor — non-medical choices",
        type: "multiselect",
        options: [
          o("labor_at_home", "Labor at home"),
          o("birth_center", "Birth center"),
          o("hospital", "Hospital"),
          o("own_clothes", "Wear own clothes / gown"),
          o("hospital_gown", "Hospital gown"),
          o("fluids", "Fluids"),
          o("ice_or_popsicles", "Ice / popsicles"),
          o("bring_food", "Bring food"),
          o("herbs_tinctures", "Herbs / tinctures"),
          o("homeopathics", "Homeopathics"),
          o("aromatherapy", "Aromatherapy"),
          o("music", "Music"),
          o("walking", "Walking"),
          o("shower_or_jacuzzi", "Shower / jacuzzi"),
          o("birth_ball", "Birth ball"),
          o("rocking_chair", "Rocking chair"),
          o("tens_unit", "TENS unit"),
        ],
      },
    ],
  },
  {
    key: "early_labor_medical",
    label: "Early labor — medical choices",
    fields: [
      {
        key: "early_labor_medical",
        label: "Early labor — medical choices",
        type: "multiselect",
        options: [
          o("continuous_fetal_monitoring", "Continuous fetal monitoring"),
          o("intermittent_monitoring", "Intermittent monitoring"),
          o("no_iv_or_heplock", "No IV / heplock"),
          o("heparin_lock", "Heparin lock"),
          o("iv", "IV"),
          o("vaginal_checks_limited", "Vaginal checks limited"),
          o("no_vaginal_checks", "No vaginal checks"),
          o("vaginal_checks_per_protocol", "Vaginal checks per protocol"),
          o("spontaneous_rom", "Spontaneous ROM"),
          o("artificial_rom", "Artificial ROM"),
          o("medications_offered", "Medications offered"),
          o("medications_not_offered", "Medications not offered"),
          o("epidural", "Epidural"),
          o("narcotics", "Narcotics"),
          o("nitrous_oxide", "Nitrous oxide"),
        ],
      },
      {
        key: "medication_code_word",
        label: "Code word for medication / epidural?",
        type: "text",
      },
    ],
  },
  {
    key: "birth_choices",
    label: "Choices for birth",
    fields: [
      {
        key: "birth_choices",
        label: "Choices for birth",
        type: "multiselect",
        options: [
          o("parent_chooses_position", "Parent chooses position"),
          o("provider_chooses_position", "Provider chooses position"),
          o("pictures", "Pictures"),
          o("video", "Video"),
          o("provider_lubrication", "Provider's lubrication"),
          o("own_lubrication", "Own lubrication"),
          o("decline_lubrication", "Decline lubrication"),
          o("decline_betadine", "Decline Betadine"),
          o("perineal_massage", "Perineal massage"),
          o("episiotomy", "Episiotomy"),
          o("prefer_tear_over_episiotomy", "Prefer tear over episiotomy"),
          o("mirror", "Mirror"),
          o("delayed_cord_clamping", "Delayed cord clamping"),
          o("touch_babys_head", "Touch baby's head"),
          o("cord_cut_by_partner", "Cord cut by partner"),
          o("placenta_without_pitocin", "Placenta without Pitocin"),
          o("announce_gender", "Announce gender"),
          o("baby_on_chest_immediately", "Baby on chest immediately"),
          o("baby_cleaned_first", "Baby cleaned first"),
          o("delay_newborn_procedures", "Delay newborn procedures at least one hour"),
        ],
      },
    ],
  },
  {
    key: "newborn_procedures",
    label: "Newborn procedures",
    fields: [
      {
        key: "newborn_procedures",
        label: "Newborn procedures",
        type: "multiselect",
        options: [
          o("vitamin_k", "Vitamin K"),
          o("eye_ointment", "Eye ointment"),
          o("hep_b_shot", "Hep B shot"),
        ],
      },
    ],
  },
  {
    key: "gender_and_name",
    label: "Gender & name",
    fields: [
      {
        key: "know_gender",
        label: "Know gender?",
        type: "select",
        options: [o("boy", "Boy"), o("girl", "Girl"), o("surprise", "Surprise")],
      },
      { key: "baby_name", label: "Name?", type: "text" },
      {
        key: "circumcising",
        label: "Circumcising if boy?",
        type: "select",
        options: YES_NO,
      },
      {
        key: "circumcising_detail",
        label: "If yes, where and when?",
        type: "textarea",
        help: "Note Vitamin K if circumcision is planned.",
      },
    ],
  },
  {
    key: "placenta_and_cord_blood",
    label: "Placenta / cord blood",
    fields: [
      {
        key: "keeping_placenta",
        label: "Keeping placenta?",
        type: "select",
        required: true,
        options: YES_NO,
      },
      { key: "encapsulator_hired", label: "Encapsulator hired?", type: "text" },
      {
        key: "cord_blood_banking",
        label: "Cord blood banking?",
        type: "select",
        options: YES_NO,
        help: "If yes, register the kit before the due date.",
      },
    ],
  },
  {
    key: "induction",
    label: "Induction / augmentation",
    fields: [
      {
        key: "induction_methods",
        label: "Induction methods",
        type: "multiselect",
        options: [
          o("no_induction", "No induction"),
          o("no_pitocin", "No Pitocin"),
          o("pitocin_with_slow_progress", "Pitocin with slow progress"),
          o("prostaglandin_gel", "Prostaglandin gel"),
          o("cytotec", "Cytotec"),
          o("arom_without_labor", "AROM without labor"),
          o("foley", "Foley"),
          o("stripping_membranes", "Stripping membranes"),
          o("nipple_stimulation", "Nipple stimulation"),
        ],
      },
    ],
  },
  {
    key: "cesarean",
    label: "Cesarean preferences",
    fields: [
      {
        key: "cesarean_preferences",
        label: "Cesarean preferences",
        type: "multiselect",
        options: [
          o("epidural", "Epidural"),
          o("spinal", "Spinal"),
          o("partner_present", "Partner present"),
          o("doula_present", "Doula present"),
          o("partner_cuts_cord", "Partner cuts cord"),
          o("doula_for_repair", "Doula stays for repair"),
          o("pictures_or_video", "Pictures / video"),
          o("clear_drape", "Clear drape"),
          o("drape_dropped", "Drape dropped"),
          o("one_arm_free", "One arm free"),
          o("breastfeeding_in_recovery", "Breastfeeding in recovery"),
          o("breastfeeding_in_or", "Breastfeeding in OR if possible"),
        ],
      },
    ],
  },
  signatureGroup("signature"),
];

export const CHART_DOCUMENT_KEYS = [
  "prenatal_visit",
  "postpartum_visit",
  "birth_log",
  "care_plan",
] as const;

export type ChartDocumentKey = (typeof CHART_DOCUMENT_KEYS)[number];

export const CHART_DOCUMENTS: Record<ChartDocumentKey, ChartDocumentDef> = {
  prenatal_visit: {
    key: "prenatal_visit",
    label: "Prenatal visit note",
    table: "visit_notes",
    groups: PRENATAL_VISIT_GROUPS,
  },
  postpartum_visit: {
    key: "postpartum_visit",
    label: "Postpartum visit note",
    table: "visit_notes",
    groups: POSTPARTUM_VISIT_GROUPS,
  },
  birth_log: {
    key: "birth_log",
    label: "Doula's birth log",
    table: "birth_logs",
    groups: BIRTH_LOG_GROUPS,
  },
  care_plan: {
    key: "care_plan",
    label: "Birth preferences & care plan",
    table: "care_plans",
    groups: CARE_PLAN_GROUPS,
  },
};

/** `visit_notes.kind` — the two documents that table holds. */
export const VISIT_NOTE_KINDS = ["prenatal", "postpartum"] as const;
export type VisitNoteKind = (typeof VISIT_NOTE_KINDS)[number];

const VISIT_NOTE_DOCUMENTS: Record<VisitNoteKind, ChartDocumentKey> = {
  prenatal: "prenatal_visit",
  postpartum: "postpartum_visit",
};

export function visitNoteDocumentKey(kind: VisitNoteKind): ChartDocumentKey {
  return VISIT_NOTE_DOCUMENTS[kind];
}

/**
 * `status` on all three chart tables. A signed row is immutable; `amended` marks the row
 * that supersedes an earlier signed version via its parent pointer.
 */
export const CHART_STATUSES = ["draft", "signed", "amended"] as const;
export type ChartStatus = (typeof CHART_STATUSES)[number];

/** What one answer may be, matching the field types above. */
export type ChartGridRow = Record<string, string>;
export type ChartAnswerValue = string | number | boolean | string[] | ChartGridRow[];
export type ChartAnswers = Record<string, ChartAnswerValue>;

export function chartDocument(key: ChartDocumentKey): ChartDocumentDef {
  return CHART_DOCUMENTS[key];
}

/** Every field of a document, flattened in form order. */
export function chartFields(key: ChartDocumentKey): ChartFieldDef[] {
  return CHART_DOCUMENTS[key].groups.flatMap((group) => [...group.fields]);
}

export function chartField(key: ChartDocumentKey, fieldKey: string): ChartFieldDef | undefined {
  return chartFields(key).find((field) => field.key === fieldKey);
}

export function chartFieldKeys(key: ChartDocumentKey): string[] {
  return chartFields(key).map((field) => field.key);
}

/** Starred on the form: what "Show missing fields" checks before a doula may sign. */
export function requiredFieldKeys(key: ChartDocumentKey): string[] {
  return chartFields(key)
    .filter((field) => field.required)
    .map((field) => field.key);
}

/** Never client-visible under any share policy. */
export function clinicalFieldKeys(key: ChartDocumentKey): string[] {
  return chartFields(key)
    .filter((field) => field.clinical)
    .map((field) => field.key);
}
