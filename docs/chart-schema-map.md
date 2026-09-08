# Chart schema map (TOK-44)

What NOVA fills in Dubsado today, and where each answer lands in Tokos. Schema, field
definitions and rules only — the charting UI is TOK-43 and the share/ACL APIs are TOK-45,
neither of which exists yet.

Ground truth for the field lists is the live portal inventory:

- `/workspace/tokos-audit/dubsado-forms/BIRTH-LOG-FIELDS.md`
- `/workspace/tokos-audit/dubsado-forms/PRENATAL-VISIT-FIELDS.md`

Ground truth for scope is `F1` / `F4` / `F8` in `/workspace/tokos-research/ehr/open-questions.md`
and the reconcile memo `/workspace/tokos-research/ehr/notion-ready-reconcile.md`. The memo
overrides the earlier LLM posture that deferred the clinical half of the Birth Log: those
fields are on the form a doula fills tonight, so they ship, staff-only.

## The pieces

| File | Holds |
|---|---|
| `src/lib/chart/field-defs.ts` | Every chart field: key, label, type, options, required, clinical, as-reported |
| `src/lib/chart/schemas.ts` | Zod validators derived from those defs — `draft` and `signed` modes |
| `src/lib/chart/share-policy.ts` | The share policy values, the defaults, and what a client may ever see |
| `src/lib/chart/audit-actions.ts` | The chart `action` / `entity_type` strings for `audit_logs` |
| `src/db/schema.ts` | `visit_notes`, `birth_logs`, `care_plans` |

Labels and keys live in `field-defs` and nowhere else. A page, query, seed or fixture that
spells a question out again is a second source of truth for what the form says, and the
next inventory change will only fix one of them.

## Neon is the chart system of record

PHI tier 3 and above lives in Neon and only in Neon. Chart answers never enter Stripe
metadata, a Resend body, an e-sign field name, or an audit metadata blob — `lib/phi`
enforces the last of those, and `chartAuditMetadata` is built to pass it.

**There is no FHIR write path and no FHIR mirror.** The Neon domain tables are the record.
FHIR is naming inspiration for a possible one-way export seam later; adopting a FHIR server
as the product is explicitly rejected (reconcile memo §3).

## Tables

All three follow the house pattern: `uuid` primary key from `newId()`, `organization_id`
on every row, `created_at` / `updated_at`, and org-scoped indexes.

| Column | `visit_notes` | `birth_logs` | `care_plans` |
|---|---|---|---|
| `kind` | `prenatal` \| `postpartum` | — | — |
| `status` | `draft` \| `signed` \| `amended` | same | same |
| `version` | int, starts at 1 | same | same |
| parent pointer | `parent_visit_note_id` | `parent_birth_log_id` | `parent_care_plan_id` |
| `answers` jsonb | keyed by field def | keyed by field def | keyed by field def |
| `share_policy` | default `staff_only` | **NOT NULL, default `staff_only`** | default `staff_only` |
| scope | `organization_id`, `client_id`, `engagement_id`, `author_user_id` | same | same |
| signature | `signed_at`, `signed_by_user_id` | same | same |
| indexes | org+client, org+engagement, parent | same | same |

`audit_logs` is reused unchanged — chart work adds vocabulary, not a table.

### Sign → lock, amendment → new row

Dubsado says *"Once this document is submitted, it will no longer be editable."* Tokos
keeps that. A row moves `draft` → `signed`, `signed_at` and `signed_by_user_id` fill in,
and from then on the row is read-only. A correction is a **new row** with `version + 1`,
`status = amended`, and its parent pointer at the row it supersedes — never an update in
place. Signing requires every starred field: `missingRequiredFieldKeys()` is the
"Show Missing Fields" button, and the `signed` zod mode is the gate behind it.

## Share policy — what a family may see

Three values, in `share-policy.ts`: `staff_only`, `preferences_shareable`, `shared_summary`.
Every table defaults to `staff_only`. Nothing reaches a family by accident.

### The Birth Log grid is staff-only, permanently

`birth_logs.share_policy` is NOT NULL and defaults to `staff_only`. On top of that,
`clientVisibleFieldKeys()` filters out every field marked `clinical` under **every** policy,
including `shared_summary`. A family opening a dilation/effacement/station grid, an
interventions list, an APGAR or a degree of tearing they were never walked through is the
outcome this schema is shaped to make impossible:

- Dilation, effacement, station — admission field and all 16 grid rows
- Interventions, and CM dilated when Pitocin started
- Degree of tearing
- APGAR 1 minute / 5 minute, newborn care

An explicit share added in TOK-45 is a **shared summary**, never the clinical grid. TOK-45's
share APIs must call `clientVisibleFieldKeys()` rather than re-deriving the rule.

### Faith K1 / K2 — defaults while we wait

These are research defaults, not Faith's answers, and they are the conservative reading:

- **K1 (share):** Birth Log staff-only, never client by default. Signed prenatal
  *preferences* — the care plan — are the one document that may be shared back. No
  dilation, APGAR or tearing to a client, ever. So `care_plans` still defaults to
  `staff_only`; `CARE_PLAN_SHAREABLE_POLICY` is the value TOK-45 may set on a signed plan
  once a doula chooses to, which keeps the permissive reading a decision someone makes
  rather than one we shipped.
- **K2 (ACL):** assigned doula plus owner/admin; on-call break-glass with a typed reason
  and an audit row. TOK-44 ships only the `share_policy` flag and the audit vocabulary
  (`chart.break_glass`); the APIs are TOK-45.

### Dilation and station are documented as reported

Fields flagged `asReported` are recorded from the hospital or birth team's report, or from
what the doula was told — **not** an exam Tokos performed. This covers the admission
dilation/effacement/station field, the grid, interventions, tearing, and the prenatal
medical flags (GBS, gestational diabetes, RH). TOK-43's copy must carry this; the flag lives
on the field so the UI cannot forget it. (Faith K8 confirms the final wording.)

## Inventory → keys

### Doula's Birth Log → `birth_logs` (document `birth_log`)

| Inventory | Key |
|---|---|
| 1–2 Client first / last name * | `client_first_name`, `client_last_name` |
| 3 Due date * | `due_date` |
| 4 Date of Birth * | `date_of_birth` |
| 5 Time of birth * | `time_of_birth` |
| 6 Location of Birth * | `birth_location` |
| 7 Name of Care Provider at Delivery * | `delivery_care_provider` |
| 8 Other care Providers | `other_care_providers` |
| 9 Nurse(s) | `nurses` |
| 10 Time labor began * | `labor_began_at` |
| 11 Dilation/Effacement/Station when admitted * | `admission_dilation_effacement_station` |
| 12 Spontaneous rupture of membranes? * | `spontaneous_rupture_of_membranes` |
| 13 Location? | `rupture_location` |
| 14 Was meconium present? | `meconium_present` |
| 15–17 Approx length first / second / third stage | `first_stage_length`, `second_stage_length`, `third_stage_length` |
| 18 Third stage complications | `third_stage_complications` |
| 19 Did baby latch prior to you leaving? | `latched_before_doula_left` |
| 20–23 Gender, name, weight, length | `baby_gender`, `baby_name`, `baby_weight`, `baby_length` |
| 24–26 Doula arrived / left / hours * | `doula_arrived_at`, `doula_left_at`, `doula_hours_at_birth` |
| Birth Log grid — 16 rows × time, dilation, effacement, station | `labor_grid` (grid; columns `time`, `dilation`, `effacement`, `station`) |
| Interventions checkboxes (23) | `interventions` |
| CM dilated when Pitocin started | `pitocin_start_dilation_cm` |
| Degree of tearing 0–4 | `degree_of_tearing` |
| Newborn care (Vit K, erythromycin, Hep B, C Pap, resuscitation, NICU) | `newborn_care` |
| APGAR 1 min / 5 min | `apgar_one_minute`, `apgar_five_minute` |
| Additional events | `additional_events` |
| Doula first / last / signature | `doula_first_name`, `doula_last_name`, `doula_signature` |

### Prenatal Visit → two documents

The Dubsado prenatal form is one long page that mixes the **visit record** with the
family's **birth preferences**. Tokos splits it where the two halves diverge, because only
one of them can ever be handed back to a family:

- Items 1–15, the medical conditions block, the support/daily-life block and the doula
  checklist → `visit_notes` (`kind = prenatal`, document `prenatal_visit`)
- The preference clusters → `care_plans` (document `care_plan`)

Every inventory line lands in exactly one of the two. The signature block is the only thing
both carry, because both are signed. `field-defs.test.ts` holds this 1:1 mapping.

| Inventory | Document | Key |
|---|---|---|
| 1 Date of this prenatal visit * | visit | `visit_date` |
| 2 Name (first, last) | visit | `client_first_name`, `client_last_name` |
| 3 Home Address (street, city, state, zip) | visit | `home_address_street`, `home_address_city`, `home_address_state`, `home_address_zip` |
| 4 Estimated Due Date | visit | `estimated_due_date` |
| 5 Parking around your home | visit | `parking_notes` |
| 6 Name of Partner | visit | `partner_name` |
| 7–8 Care provider, Practice | visit | `care_provider_name`, `care_provider_practice` |
| 9 Who will be attending your birth? | visit | `birth_attendees` |
| 10 Expected Place of birth | visit | `expected_birth_place` |
| 11 Partner — how do you see yourself | visit | `partner_role_expectation` |
| 12 Is this your first birth? * | visit | `first_birth` |
| 13 Past birth experiences | visit | `past_birth_experiences` |
| 14 Laboring at home plan | visit | `laboring_at_home_plan` |
| 15 Concerns (labor / postpartum / other) | visit | `concerns_labor_birth`, `concerns_postpartum`, `concerns_other` |
| Early Labor — Non-Medical Choices | care plan | `early_labor_non_medical` |
| Early Labor — Medical Choices | care plan | `early_labor_medical` |
| 16 Code word for medication/epidural | care plan | `medication_code_word` |
| Birth — Choices for Birth | care plan | `birth_choices` |
| Newborn procedures | care plan | `newborn_procedures` |
| Know gender / name / circumcision | care plan | `know_gender`, `baby_name`, `circumcising`, `circumcising_detail` |
| Placenta / encapsulator / cord blood | care plan | `keeping_placenta`, `encapsulator_hired`, `cord_blood_banking` |
| Induction methods | care plan | `induction_methods` |
| C-section preferences | care plan | `cesarean_preferences` |
| Group B Strep *, Gestational Diabetes *, RH − * | visit | `group_b_strep`, `gestational_diabetes`, `rh_negative` |
| Other medical conditions | visit | `other_medical_conditions` |
| LEEP / cervical surgery (+ explain) | visit | `leep_or_cervical_surgery`, `leep_or_cervical_surgery_detail` |
| Allergies * | visit | `allergies` |
| Expectations for birth team | visit | `birth_team_expectations` |
| Stress / what helps relax | visit | `stress_and_relaxation` |
| Pets or other children | visit | `pets_or_children_plan` |
| Childbirth class location | visit | `childbirth_class` |
| Exercise regularly + frequency | visit | `exercises_regularly`, `exercise_frequency` |
| Chiropractor | visit | `sees_chiropractor` |
| Postpartum meals/housework help | visit | `postpartum_help` |
| Cultural/religious rituals * | visit | `cultural_or_religious_rituals` |
| FOR SOLO ONLY: preferred back-up | visit | `solo_backup_preference` |
| FOR HOMEBIRTH ONLY: supplies / waterbirth | visit | `homebirth_supplies`, `homebirth_waterbirth` |
| Doula checklist: 18 hour clause, when to call | visit | `reviewed_18_hour_clause`, `reviewed_when_to_call` |
| Doula first / last / signature | both | `doula_first_name`, `doula_last_name`, `doula_signature` |

### Postpartum visit — deliberately thin

`visit_notes` accepts `kind = postpartum` and the `postpartum_visit` document holds the
visit spine (`visit_date`, `visit_summary`) and the signature block only. The NOVA
postpartum form has not been inventoried yet (research R1), and inventing clinical
questions no doula asked for would be the same mistake in the other direction. The
template fills in when the inventory lands.

## Out of scope here

| Not in TOK-44 | Where it lives |
|---|---|
| Chart pages, forms, the grid UI | TOK-43 |
| Read/share/break-glass APIs, assigned-doula enforcement | TOK-45 |
| Shell/role chrome | TOK-46 |
| SMS, Acuity import, AI drafting, claims/coding | Out of P1 (F2/F5, calendar lock) |
| FHIR adapters of any kind | Not planned as a write path |
