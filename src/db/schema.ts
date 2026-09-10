import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { ChartAnswers } from "../lib/chart/field-defs";
import type { ProviderRate } from "../lib/provider-rates";
import {
  BIRTH_LOG_DEFAULT_SHARE_POLICY,
  DEFAULT_SHARE_POLICY,
} from "../lib/chart/share-policy";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  portalName: text("portal_name").notNull(),
  primaryColor: text("primary_color").notNull().default("#0F6E56"),
  customDomain: text("custom_domain"),
  footerHtml: text("footer_html"),
  onCallPhone: text("on_call_phone"),
  websiteUrl: text("website_url"),
  confidentialityBlurb: text("confidentiality_blurb"),
  logoFileId: uuid("logo_file_id"),
  ...timestamps,
}, (table) => [uniqueIndex("organizations_slug_idx").on(table.slug)]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  credentialsLabel: text("credentials_label"),
  image: text("image"),
  /**
   * When this person accepted the Tokos terms, and which version they accepted (TOK-57).
   * One row per person rather than one per invite: a doula who joins a second agency has
   * already said yes, and "has this human agreed" is a fact about the human.
   */
  tosAcceptedAt: timestamp("tos_accepted_at", { withTimezone: true }),
  tosVersion: text("tos_version"),
  ...timestamps,
}, (table) => [uniqueIndex("users_email_idx").on(table.email)]);

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: text("role").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("memberships_org_user_idx").on(table.organizationId, table.userId),
  index("memberships_user_idx").on(table.userId),
]);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  email: text("email").notNull(),
  role: text("role").notNull(),
  token: text("token").notNull(),
  kind: text("kind").notNull().default("staff"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
  clientId: uuid("client_id"),
  /** Typed into the Add-team-member popup, so a pending card has a person on it (TOK-57). */
  name: text("name"),
  ...timestamps,
}, (table) => [
  uniqueIndex("invites_token_idx").on(table.token),
  index("invites_org_idx").on(table.organizationId),
]);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  displayName: text("display_name").notNull(),
  preferredName: text("preferred_name"),
  email: text("email").notNull(),
  phone: text("phone"),
  source: text("source").notNull().default("web"),
  edd: date("edd"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  region: text("region"),
  postalCode: text("postal_code"),
  alternateContactName: text("alternate_contact_name"),
  alternateContactPhone: text("alternate_contact_phone"),
  internalNotes: text("internal_notes"),
  /**
   * The lead record NOVA runs the practice off (TOK-49). These live on `clients` rather
   * than a parallel lead table because a lead and a family are the same person a few
   * weeks apart — splitting them would mean copying rows at `complete` and losing the
   * intake number, the source, and the follow-up history exactly when they matter.
   *
   * Every picker column stores a value from `src/lib/lead-fields.ts`; nothing here is a
   * free string the UI invents. Deliberately excluded: card numbers, member ids, and any
   * health detail — insurance is a yes/no/unknown and a carrier name, nothing more,
   * until there is a BAA.
   */
  serviceType: text("service_type"),
  hospital: text("hospital"),
  assignedProvider: text("assigned_provider"),
  insurance: text("insurance").notNull().default("unknown"),
  insuranceProvider: text("insurance_provider"),
  consultDate: date("consult_date"),
  lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
  followUpDueOn: date("follow_up_due_on"),
  /** External reference (PSAF/BDQ) so NOVA's own numbering survives migration. */
  intakeRef: text("intake_ref"),
  /** Staff who owns the lead. Distinct from the matched primary doula. */
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  reviewed: boolean("reviewed").notNull().default(false),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("clients_org_idx").on(table.organizationId),
  index("clients_org_email_idx").on(table.organizationId, table.email),
  index("clients_org_follow_up_idx").on(table.organizationId, table.followUpDueOn),
  index("clients_org_owner_idx").on(table.organizationId, table.ownerUserId),
  // Dedupe on re-import keys off this pair, so it is a uniqueness rule and not a hope.
  uniqueIndex("clients_org_intake_ref_idx").on(table.organizationId, table.intakeRef),
]);

/**
 * The running, dated notes feed on a lead (TOK-49) — the one Airtable behaviour NOVA
 * names as her favourite. Append-only by design: a note is what was true when it was
 * written, so a correction is another note rather than an edit.
 *
 * `source` says where the line came from (`staff`, `import`, `system`), which is what
 * makes it safe for a daily AI summary to append here later without a reader ever
 * mistaking a machine's guess for a person's note.
 */
export const clientAiNotes = pgTable("client_ai_notes", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  body: text("body").notNull(),
  source: text("source").notNull().default("staff"),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("client_ai_notes_client_idx").on(table.clientId, table.at),
  index("client_ai_notes_org_idx").on(table.organizationId, table.at),
]);

export const pipelineStages = pgTable("pipeline_stages", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  stage: text("stage").notNull(),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  fitConfirmedAt: timestamp("fit_confirmed_at", { withTimezone: true }),
  fitConfirmedByUserId: uuid("fit_confirmed_by_user_id").references(() => users.id),
  ...timestamps,
}, (table) => [
  uniqueIndex("pipeline_stages_client_idx").on(table.clientId),
  index("pipeline_stages_org_stage_idx").on(table.organizationId, table.stage),
]);

export const pipelineEvents = pgTable("pipeline_events", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  fromStage: text("from_stage"),
  toStage: text("to_stage").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  reason: text("reason"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("pipeline_events_client_idx").on(table.clientId)]);

export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("primary"),
  status: text("status").notNull().default("active"),
  ...timestamps,
}, (table) => [
  uniqueIndex("assignments_client_user_idx").on(table.clientId, table.userId),
  index("assignments_user_idx").on(table.userId),
]);

export const engagements = pgTable("engagements", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  packageLabel: text("package_label").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  targetDate: date("target_date"),
  locationLabel: text("location_label"),
  status: text("status").notNull().default("open"),
  primaryDoulaUserId: uuid("primary_doula_user_id").references(() => users.id),
  ...timestamps,
}, (table) => [index("engagements_client_idx").on(table.clientId)]);

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  engagementId: uuid("engagement_id").references(() => engagements.id),
  packageLabel: text("package_label").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  status: text("status").notNull().default("draft"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("contracts_client_idx").on(table.clientId)]);

export const contractEvents = pgTable("contract_events", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  contractId: uuid("contract_id").notNull().references(() => contracts.id),
  type: text("type").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  payload: jsonb("payload").$type<Record<string, string>>(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("contract_events_contract_idx").on(table.contractId)]);

export const esignArtifacts = pgTable("esign_artifacts", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  contractId: uuid("contract_id").notNull().references(() => contracts.id),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  rawStatus: text("raw_status").notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  documentUrl: text("document_url"),
  fileObjectId: uuid("file_object_id"),
  ...timestamps,
}, (table) => [
  uniqueIndex("esign_artifacts_external_idx").on(table.provider, table.externalId),
  index("esign_artifacts_contract_idx").on(table.contractId),
]);

export const paymentStatuses = pgTable("payment_statuses", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  contractId: uuid("contract_id").notNull().references(() => contracts.id),
  method: text("method").notNull(),
  status: text("status").notNull(),
  amountCents: integer("amount_cents").notNull(),
  externalId: text("external_id"),
  clearedAt: timestamp("cleared_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("payment_statuses_contract_idx").on(table.contractId),
  index("payment_statuses_external_idx").on(table.method, table.externalId),
]);

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").references(() => clients.id),
  assigneeUserId: uuid("assignee_user_id").references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("scheduled"),
  locationLabel: text("location_label"),
  ...timestamps,
}, (table) => [
  index("calendar_events_assignee_idx").on(table.assigneeUserId, table.startsAt),
  index("calendar_events_client_idx").on(table.clientId),
]);

export const availability = pgTable("availability", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  weekday: integer("weekday").notNull(),
  startMinutes: integer("start_minutes").notNull(),
  endMinutes: integer("end_minutes").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  ...timestamps,
}, (table) => [index("availability_user_idx").on(table.userId, table.weekday)]);

export const clientPortalAccess = pgTable("client_portal_access", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  userId: uuid("user_id").references(() => users.id),
  email: text("email").notNull(),
  status: text("status").notNull().default("invited"),
  inviteToken: text("invite_token"),
  inviteSentAt: timestamp("invite_sent_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("client_portal_access_client_idx").on(table.clientId),
  uniqueIndex("client_portal_access_email_org_idx").on(table.organizationId, table.email),
]);

export const formTemplates = pgTable("form_templates", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  /**
   * `family` | `staff` (TOK-50). A staff template is doula/agency work — visit notes,
   * the Birth Log — and may never be assigned into a family portal. Defaults to
   * `family` so every row written before this column keeps behaving as it did.
   * Read it through `@/lib/form-audience`, never as a bare string comparison.
   */
  audience: text("audience").notNull().default("family"),
  schemaJson: jsonb("schema_json").$type<{
    fields: Array<{ id: string; label: string; type: string; sensitive?: boolean }>;
  }>().notNull(),
  version: integer("version").notNull().default(1),
  ...timestamps,
});

export const formAssignments = pgTable("form_assignments", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  templateId: uuid("template_id").notNull().references(() => formTemplates.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  engagementId: uuid("engagement_id").references(() => engagements.id),
  status: text("status").notNull().default("incomplete"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  assigneeRole: text("assignee_role").notNull().default("either"),
  ...timestamps,
}, (table) => [index("form_assignments_client_idx").on(table.clientId)]);

export const formSubmissions = pgTable("form_submissions", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  assignmentId: uuid("assignment_id").notNull().references(() => formAssignments.id),
  submittedByUserId: uuid("submitted_by_user_id").references(() => users.id),
  answersJson: jsonb("answers_json").$type<Record<string, string>>().notNull(),
  fileObjectId: uuid("file_object_id"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("form_submissions_assignment_idx").on(table.assignmentId)]);

export const resources = pgTable("resources", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  /**
   * Whose handout this is (TOK-70). `null` means the practice wrote it and everyone in
   * the workspace sees it; a user id means it is written in that person's first-person
   * voice and only she has it in her library. Without this, an agency's second doula
   * opened her library and found the founder's named scope-of-practice handout in it.
   */
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("handout"),
  url: text("url"),
  body: text("body"),
  tags: text("tags").array(),
  fileObjectId: uuid("file_object_id"),
  ...timestamps,
}, (table) => [index("resources_org_owner_idx").on(table.organizationId, table.ownerUserId)]);

export const resourceShares = pgTable("resource_shares", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  resourceId: uuid("resource_id").notNull().references(() => resources.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  engagementId: uuid("engagement_id").references(() => engagements.id),
  sharedAt: timestamp("shared_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [index("resource_shares_client_idx").on(table.clientId)]);

export const portalMessages = pgTable("portal_messages", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  fromUserId: uuid("from_user_id").references(() => users.id),
  direction: text("direction").notNull(),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, (table) => [index("portal_messages_client_idx").on(table.clientId, table.sentAt)]);

/**
 * Pinned conversations in the staff inbox (TOK-56).
 *
 * A pin is personal, the way it is in WhatsApp: Maya pinning the family she is on call
 * for tonight should not reorder Priya's inbox. Hence the row is scoped to
 * (organization, user, client) with a unique index — pinning twice is idempotent, and
 * unpinning is a delete rather than a nullable flag nobody would ever clear.
 *
 * Deliberately its own table instead of a column on `portal_messages`: the pin belongs to
 * the thread, and the thread is the family, not any one message.
 */
export const portalThreadPins = pgTable("portal_thread_pins", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  pinnedAt: timestamp("pinned_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("portal_thread_pins_user_client_idx").on(table.userId, table.clientId),
  index("portal_thread_pins_org_idx").on(table.organizationId, table.userId),
]);

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  triggerKey: text("trigger_key").notNull(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  fromName: text("from_name").notNull(),
  replyTo: text("reply_to"),
  subjectTpl: text("subject_tpl").notNull(),
  bodyHtmlTpl: text("body_html_tpl").notNull(),
  bodyTextTpl: text("body_text_tpl").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("email_templates_org_trigger_idx").on(table.organizationId, table.triggerKey)]);

export const emailTemplateVersions = pgTable("email_template_versions", {
  id: uuid("id").primaryKey(),
  templateId: uuid("template_id").notNull().references(() => emailTemplates.id),
  version: integer("version").notNull(),
  subjectTpl: text("subject_tpl").notNull(),
  bodyHtmlTpl: text("body_html_tpl").notNull(),
  bodyTextTpl: text("body_text_tpl").notNull(),
  authoredByUserId: uuid("authored_by_user_id").references(() => users.id),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outboxMessages = pgTable("outbox_messages", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  templateId: uuid("template_id").references(() => emailTemplates.id),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(),
  bodyHtml: text("body_html").notNull(),
  status: text("status").notNull().default("pending"),
  provider: text("provider").notNull().default("stub"),
  providerMessageId: text("provider_message_id"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  renderVars: jsonb("render_vars").$type<Record<string, string>>(),
  ...timestamps,
}, (table) => [index("outbox_messages_status_idx").on(table.status, table.scheduledAt)]);

export const fileObjects = pgTable("file_objects", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  bucket: text("bucket").notNull(),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes"),
  purpose: text("purpose").notNull(),
  // Stub mode has no bucket to read back from, so small non-PHI assets (provider photos)
  // keep their bytes here as base64 to keep demo/preview deploys honest. Never set when
  // S3 is configured, and never used for signed contract evidence.
  inlineData: text("inline_data"),
  ...timestamps,
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, string>>(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_logs_org_idx").on(table.organizationId, table.at)]);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  contractId: uuid("contract_id").references(() => contracts.id),
  engagementId: uuid("engagement_id").references(() => engagements.id),
  number: text("number").notNull(),
  status: text("status").notNull().default("open"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("invoices_org_number_idx").on(table.organizationId, table.number),
  index("invoices_client_idx").on(table.clientId),
]);

export const invoiceLines = pgTable("invoice_lines", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitAmountCents: integer("unit_amount_cents").notNull(),
});

export const providerProfiles = pgTable("provider_profiles", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  slug: text("slug").notNull(),
  headline: text("headline").notNull(),
  bio: text("bio").notNull(),
  /**
   * Structured rates and a real service area (TOK-57). `ratesJson` is the truth — one
   * entry per offered service with an amount in cents and an hourly/per-day/flat basis,
   * shaped by `@/lib/provider-rates`. `serviceArea` and `ratesLabel` stay as *derived*
   * display strings, rebuilt on every save, because `/p/[slug]` and the care-team card
   * already read them and a second hand-typed source would drift away from the grid.
   */
  serviceArea: text("service_area"),
  ratesLabel: text("rates_label"),
  ratesJson: jsonb("rates_json").$type<ProviderRate[]>(),
  serviceAreaAddress: text("service_area_address"),
  serviceAreaZip: text("service_area_zip"),
  travelRadiusMiles: integer("travel_radius_miles"),
  photoFileId: uuid("photo_file_id").references(() => fileObjects.id),
  published: boolean("published").notNull().default(true),
  ...timestamps,
}, (table) => [
  uniqueIndex("provider_profiles_slug_idx").on(table.slug),
  uniqueIndex("provider_profiles_user_idx").on(table.userId),
]);

/**
 * Chart spine (TOK-44): the staff record NOVA fills in Dubsado today, in Neon.
 *
 * Neon is the system of record for the chart. These rows are the highest PHI tier the
 * product holds, so they live here and nowhere else — never in Stripe metadata, a Resend
 * body, or an e-sign field name. There is no FHIR write path and no FHIR mirror: FHIR is
 * naming inspiration for later export seams only.
 *
 * Three rules the columns encode, spelled out in `docs/chart-schema-map.md`:
 *  - Answers live in `answers` jsonb keyed by `lib/chart/field-defs`, so the field
 *    inventory has one home instead of one column per Dubsado question.
 *  - Sign locks the row. A correction is a new row pointing at its parent, never an
 *    update in place — Dubsado's "once submitted it will no longer be editable", kept.
 *  - `share_policy` is a flag on the row, defaulted closed. Birth logs default
 *    `staff_only` and their clinical fields stay staff-only under every policy.
 */

export const visitNotes = pgTable("visit_notes", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  engagementId: uuid("engagement_id").references(() => engagements.id),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  /** `prenatal` | `postpartum` — see `VISIT_NOTE_KINDS`. */
  kind: text("kind").notNull(),
  /** `draft` | `signed` | `amended` — see `CHART_STATUSES`. */
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  /** The signed row this one amends. Null on a first version. */
  parentVisitNoteId: uuid("parent_visit_note_id").references((): AnyPgColumn => visitNotes.id),
  visitDate: date("visit_date"),
  answers: jsonb("answers").$type<ChartAnswers>().notNull().default({}),
  sharePolicy: text("share_policy").notNull().default(DEFAULT_SHARE_POLICY),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signedByUserId: uuid("signed_by_user_id").references(() => users.id),
  ...timestamps,
}, (table) => [
  index("visit_notes_org_client_idx").on(table.organizationId, table.clientId),
  index("visit_notes_org_engagement_idx").on(table.organizationId, table.engagementId),
  index("visit_notes_parent_idx").on(table.parentVisitNoteId),
]);

/**
 * The full NOVA birth log — header, labor timeline, baby, doula time, the 16-row
 * dilation/effacement/station grid, interventions, degree of tearing, APGARs, newborn
 * care. All of it, keyed by field def; none of it deferred (F8).
 *
 * `share_policy` is NOT NULL and defaults to `staff_only` deliberately. A family seeing
 * this grid is the worst thing this table could do, so the closed default is a column
 * constraint rather than something a query has to remember.
 */
export const birthLogs = pgTable("birth_logs", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  engagementId: uuid("engagement_id").references(() => engagements.id),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  parentBirthLogId: uuid("parent_birth_log_id").references((): AnyPgColumn => birthLogs.id),
  answers: jsonb("answers").$type<ChartAnswers>().notNull().default({}),
  sharePolicy: text("share_policy").notNull().default(BIRTH_LOG_DEFAULT_SHARE_POLICY),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signedByUserId: uuid("signed_by_user_id").references(() => users.id),
  ...timestamps,
}, (table) => [
  index("birth_logs_org_client_idx").on(table.organizationId, table.clientId),
  index("birth_logs_org_engagement_idx").on(table.organizationId, table.engagementId),
  index("birth_logs_parent_idx").on(table.parentBirthLogId),
]);

/**
 * Birth preferences: the clusters the prenatal form gathers on the family's behalf —
 * early labor choices, birth choices, newborn procedures, placenta, induction, cesarean.
 *
 * This is the one chart document that could ever be handed back to a family (Faith K1:
 * signed preferences are shareable). It still starts `staff_only`; TOK-45 sets
 * `preferences_shareable` on a signed plan when a doula chooses to.
 */
export const carePlans = pgTable("care_plans", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  engagementId: uuid("engagement_id").references(() => engagements.id),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  parentCarePlanId: uuid("parent_care_plan_id").references((): AnyPgColumn => carePlans.id),
  answers: jsonb("answers").$type<ChartAnswers>().notNull().default({}),
  sharePolicy: text("share_policy").notNull().default(DEFAULT_SHARE_POLICY),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signedByUserId: uuid("signed_by_user_id").references(() => users.id),
  ...timestamps,
}, (table) => [
  index("care_plans_org_client_idx").on(table.organizationId, table.clientId),
  index("care_plans_org_engagement_idx").on(table.organizationId, table.engagementId),
  index("care_plans_parent_idx").on(table.parentCarePlanId),
]);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  clients: many(clients),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [clients.organizationId],
    references: [organizations.id],
  }),
  pipeline: one(pipelineStages, {
    fields: [clients.id],
    references: [pipelineStages.clientId],
  }),
  assignments: many(assignments),
}));
