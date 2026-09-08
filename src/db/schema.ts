import { relations } from "drizzle-orm";
import {
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
  ...timestamps,
}, (table) => [
  index("clients_org_idx").on(table.organizationId),
  index("clients_org_email_idx").on(table.organizationId, table.email),
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
  title: text("title").notNull(),
  kind: text("kind").notNull().default("handout"),
  url: text("url"),
  body: text("body"),
  tags: text("tags").array(),
  fileObjectId: uuid("file_object_id"),
  ...timestamps,
});

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
  serviceArea: text("service_area"),
  ratesLabel: text("rates_label"),
  photoFileId: uuid("photo_file_id").references(() => fileObjects.id),
  published: boolean("published").notNull().default(true),
  ...timestamps,
}, (table) => [
  uniqueIndex("provider_profiles_slug_idx").on(table.slug),
  uniqueIndex("provider_profiles_user_idx").on(table.userId),
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
