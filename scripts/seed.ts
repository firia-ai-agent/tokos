import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db";
import {
  assignments,
  auditLogs,
  availability,
  carePlans,
  calendarEvents,
  clientAiNotes,
  clientPortalAccess,
  clients,
  contractEvents,
  contracts,
  emailTemplates,
  emailTemplateVersions,
  engagements,
  formAssignments,
  formTemplates,
  invoiceLines,
  invoices,
  invites,
  memberships,
  organizations,
  pipelineEvents,
  pipelineStages,
  portalMessages,
  providerProfiles,
  resourceShares,
  resources,
  users,
  visitNotes,
} from "../src/db/schema";
import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  demoAccount,
  demoLoginHintLines,
} from "../src/lib/demo-logins";
import { saveProviderPhoto } from "../src/lib/provider-photo";
import { CHART_AUDIT_ACTIONS, CHART_ENTITY_TYPES, chartAuditMetadata } from "../src/lib/chart/audit-actions";
import { parseChartAnswers } from "../src/lib/chart/schemas";
import { CARE_PLAN_SHAREABLE_POLICY } from "../src/lib/chart/share-policy";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const DOULA_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_USER_ID = "33333333-3333-4333-8333-333333333333";
const CLIENT_ID = "44444444-4444-4444-8444-444444444444";
const PRIYA_USER_ID = "22222222-2222-4222-8222-222222222224";
const AVERY_USER_ID = "33333333-3333-4333-8333-333333333334";
const AVERY_CLIENT_ID = "44444444-4444-4444-8444-444444444445";
const CEDAR_ORG_ID = "11111111-1111-4111-8111-111111111112";
const CEDAR_STAFF_ID = "22222222-2222-4222-8222-222222222223";
const CEDAR_CLIENT_USER_ID = "33333333-3333-4333-8333-333333333336";
const CEDAR_CLIENT_ID = "44444444-4444-4444-8444-444444444446";
/**
 * Two leads that exist only to make the Needs Attention rules visible on a fresh seed
 * (TOK-49): one consult done with nothing written up, one overdue follow-up nobody owns.
 * Neither has a portal login — a lead is a row on the board long before she is a family.
 */
const NOOR_CLIENT_ID = "44444444-4444-4444-8444-44444444444a";
const TAMSIN_CLIENT_ID = "44444444-4444-4444-8444-44444444444b";
/**
 * Who the demo signs in as lives in `src/lib/demo-logins.ts`, so the seed, the login
 * hint, and the README cannot disagree about which of these two doulas is the founder.
 */
const MAYA = demoAccount("maya");
const PRIYA = demoAccount("priya");
const JORDAN = demoAccount("jordan");
const AVERY = demoAccount("avery");
const SAM = demoAccount("sam");
const RILEY = demoAccount("riley");
const NOVA_PRIMARY = "#0F6E56";
const CEDAR_PRIMARY = "#5C4A3A";

/** Checked-in headshots; provenance and license live in `public/seed/ATTRIBUTION.md`. */
const SEED_PHOTO_DIR = join(process.cwd(), "public", "seed");

const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
/** `yyyy-MM-dd` for a `date` column, offset from today. */
const dateFromNow = (days: number) => daysFromNow(days).toISOString().slice(0, 10);
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

/**
 * A seeded consult has to land inside Maya's published availability — weekdays 10:00 to
 * 16:00 in New York — so it is built in her timezone, not in UTC. The same 11am slot is
 * 15:00Z in summer and 16:00Z in winter, and a seed that hardcodes one is wrong for half
 * the year: it would sit outside her hours and read as a booking the app would refuse.
 */
function weekdayMorningEastern(daysAhead: number, hour: number) {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + daysAhead);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) {
    day.setUTCDate(day.getUTCDate() + 1);
  }
  const guess = new Date(`${day.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00Z`);
  const landedOn = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(guess),
  );
  return new Date(guess.getTime() + (hour - landedOn) * 60 * 60 * 1000);
}

/**
 * Gives a seeded provider a photo through the real upload path, so a seeded photo and an
 * uploaded one are the same kind of row — S3 when keys are set, bytes on the `file_objects`
 * row when they are not — and a missing or malformed asset fails the seed loudly instead of
 * leaving a profile the media route will 404.
 */
async function seedProviderPhoto(input: {
  organizationId: string;
  userId: string;
  name: string;
  photoFile: string;
}) {
  const bytes = readFileSync(join(SEED_PHOTO_DIR, input.photoFile));
  const result = await saveProviderPhoto({
    organizationId: input.organizationId,
    userId: input.userId,
    // A plain view, not the Buffer: `File` takes the same BlobPart a browser upload does.
    // The declared type is only a hint — `saveProviderPhoto` sniffs the bytes either way.
    file: new File([new Uint8Array(bytes)], input.photoFile, { type: "image/jpeg" }),
  });
  if (!result.ok) throw new Error(`seed photo rejected for ${input.name}: ${result.code}`);
}

async function main() {
  const db = getDb();
  const passwordHash = await hash(DEMO_PASSWORD, 10);

  await db.execute(sql`TRUNCATE TABLE
    visit_notes, birth_logs, care_plans,
    invoice_lines, invoices, audit_logs, file_objects, outbox_messages,
    email_template_versions, email_templates, portal_messages, resource_shares,
    client_ai_notes,
    resources, form_submissions, form_assignments, form_templates,
    client_portal_access, availability, calendar_events, payment_statuses,
    esign_artifacts, contract_events, contracts, engagements, assignments,
    pipeline_events, pipeline_stages, invites, memberships, provider_profiles,
    clients, users, organizations
    RESTART IDENTITY CASCADE`);

  await db.insert(organizations).values({
    id: ORG_ID,
    name: "NOVA Birth Partners",
    slug: "nova-birth-partners",
    timezone: "America/New_York",
    // The practice is "NOVA Birth Partners"; the thing a family logs into is Birth Prep
    // (TOK-39 E4), matching the Dubsado portal NOVA is leaving. `name` stays the legal
    // entity — only the client-facing word changes.
    portalName: "NOVA Birth Prep",
    primaryColor: NOVA_PRIMARY,
    websiteUrl: "https://novabirthpartners.com",
    onCallPhone: "(703) 555-0148",
    confidentialityBlurb:
      "What you share in this portal stays between you and your NOVA team. Sensitive notes never go out in email.",
    footerHtml: "NOVA Birth Partners · Northern Virginia",
  });

  await db.insert(users).values([
    {
      id: DOULA_ID,
      email: MAYA.email,
      name: MAYA.name,
      passwordHash,
      credentialsLabel: "CD(DONA)",
    },
    {
      id: CLIENT_USER_ID,
      email: JORDAN.email,
      name: JORDAN.name,
      passwordHash,
    },
    {
      id: PRIYA_USER_ID,
      email: PRIYA.email,
      name: PRIYA.name,
      passwordHash,
      credentialsLabel: "CD(DONA), CLC",
    },
    {
      id: AVERY_USER_ID,
      email: AVERY.email,
      name: AVERY.name,
      passwordHash,
    },
    {
      id: CEDAR_STAFF_ID,
      email: SAM.email,
      name: SAM.name,
      passwordHash,
      credentialsLabel: "CD(DONA)",
    },
    {
      id: CEDAR_CLIENT_USER_ID,
      email: RILEY.email,
      name: RILEY.name,
      passwordHash,
    },
  ]);

  // Maya owns NOVA; Priya is a second doula who already accepted (TOK-41), so the roster
  // is a real agency out of the box — two members and one still-pending invite — rather
  // than a single owner with an empty table underneath.
  await db.insert(memberships).values([
    {
      id: "55555555-5555-4555-8555-555555555555",
      organizationId: ORG_ID,
      userId: DOULA_ID,
      role: "owner",
    },
    {
      id: "55555555-5555-4555-8555-555555555557",
      organizationId: ORG_ID,
      userId: PRIYA_USER_ID,
      role: "doula",
    },
  ]);

  // Maya stays NOVA's only owner. One live staff invite sits on `/doula/team` so the
  // roster has something pending out of the box — accepting it at `/invite/<token>`
  // creates the membership through the same path the invite form uses.
  await db.insert(invites).values({
    id: "77777777-7777-4777-8777-777777777771",
    organizationId: ORG_ID,
    email: "alex@novabirthpartners.com",
    role: "doula",
    token: "nova-demo-staff-invite",
    kind: "staff",
    expiresAt: daysFromNow(7),
    invitedByUserId: DOULA_ID,
  });

  await db.insert(providerProfiles).values({
    id: "66666666-6666-4666-8666-666666666666",
    organizationId: ORG_ID,
    userId: DOULA_ID,
    slug: "maya-chen",
    headline: "Steady company for your labor and the days after",
    bio: "I support families across Northern Virginia through pregnancy, labor, and the first weeks home. My work is practical: a calm person in the room, a plan you can actually use, and clear next steps. I am not a clinician — I am the person who stays.",
    serviceArea: "Arlington, Alexandria, Fairfax, and DC",
    ratesLabel: "Birth package from $2,800",
    published: true,
  });
  await seedProviderPhoto({
    organizationId: ORG_ID,
    userId: DOULA_ID,
    name: MAYA.name,
    photoFile: "maya-chen.jpg",
  });

  // Priya has her own public page too (TOK-63). Without this row her first photo upload
  // had nothing to attach to, so a second doula on a real agency hit a dead end the
  // founder never could. There is no checked-in headshot for her, so the page falls back
  // to initials until she uploads one — which is exactly the path this row unblocks.
  await db.insert(providerProfiles).values({
    id: "66666666-6666-4666-8666-666666666668",
    organizationId: ORG_ID,
    userId: PRIYA_USER_ID,
    slug: "priya-raman",
    headline: "Overnight and postpartum care, plus births as backup",
    bio: "I take the nights and the early weeks — feeding, rest, and the small practical things that make a house work again. I also stand in as backup for births, so a family I have met is never handed to a stranger at 3am.",
    serviceArea: "Arlington, Falls Church, and McLean",
    ratesLabel: "Overnight care from $45/hr",
    published: true,
  });

  const edd = new Date();
  edd.setDate(edd.getDate() + 21);

  await db.insert(clients).values({
    id: CLIENT_ID,
    organizationId: ORG_ID,
    displayName: JORDAN.name,
    preferredName: "Jordan",
    email: JORDAN.email,
    phone: "(571) 555-0199",
    source: "referral",
    edd: edd.toISOString().slice(0, 10),
    city: "Arlington",
    region: "VA",
    postalCode: "22201",
    alternateContactName: "Sam Rivera",
    alternateContactPhone: "(571) 555-0110",
    // The lead record NOVA actually runs off (TOK-49). Jordan is the worked example:
    // owned, reviewed, insured, with a follow-up date that is not yet due.
    serviceType: "birth_support",
    hospital: "Virginia Hospital Center",
    assignedProvider: "Dr. R. Okonjo",
    insurance: "yes",
    insuranceProvider: "CareFirst",
    consultDate: dateFromNow(-9),
    lastContactAt: hoursAgo(20),
    followUpDueOn: dateFromNow(3),
    intakeRef: "PSAF-1001",
    ownerUserId: DOULA_ID,
    reviewed: true,
    reviewedAt: hoursAgo(30),
  });

  // Jordan has already met Maya and the match is made, so the row sits on `fit_confirmed`
  // with the hops that got it there. An agreement in the portal on top of a `new_lead`
  // stage would be a state the funnel rules cannot produce (TOK-41). She stops short of
  // `complete` because her deposit is still open — signed is not complete (TOK-49).
  await db.insert(pipelineStages).values({
    id: "77777777-7777-4777-8777-777777777777",
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    stage: "fit_confirmed",
    enteredAt: daysFromNow(-8),
    fitConfirmedAt: daysFromNow(-8),
    fitConfirmedByUserId: DOULA_ID,
  });
  await db.insert(pipelineEvents).values([
    {
      id: "88888888-8888-4888-8888-888888888888",
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      fromStage: null,
      toStage: "new_lead",
      reason: "seed",
      // Backdated like the hops after it, so the stepper reads as a history rather than
      // showing New lead as the most recent thing that happened.
      at: daysFromNow(-18),
    },
    {
      id: "88888888-8888-4888-8888-88888888888a",
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      fromStage: "new_lead",
      toStage: "outreach_sent",
      reason: "seed",
      at: daysFromNow(-16),
    },
    {
      id: "88888888-8888-4888-8888-88888888888b",
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      fromStage: "outreach_sent",
      toStage: "consult_scheduled",
      reason: "seed",
      at: daysFromNow(-12),
    },
    {
      id: "88888888-8888-4888-8888-88888888888d",
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      fromStage: "consult_scheduled",
      toStage: "consult_done",
      reason: "seed",
      at: daysFromNow(-9),
    },
    {
      id: "88888888-8888-4888-8888-88888888888e",
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      fromStage: "consult_done",
      toStage: "fit_confirmed",
      reason: "seed",
      at: daysFromNow(-8),
    },
  ]);
  // Jordan's consult is written up, which is what keeps her off Needs Attention while
  // Noor — same stage, no note — sits on it.
  await db.insert(clientAiNotes).values([
    {
      id: "cc000000-0000-4000-8000-000000000001",
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      body: "Consult at their place. Wants an unmedicated birth at VHC, partner is nervous about the drive. Sending the comfort-measures handout and a package quote tonight.",
      source: "staff",
      actorUserId: DOULA_ID,
      at: daysFromNow(-9),
    },
    {
      id: "cc000000-0000-4000-8000-000000000002",
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      body: "Agreement and deposit invoice sent. Following up Friday if the deposit has not cleared.",
      source: "staff",
      actorUserId: DOULA_ID,
      at: daysFromNow(-7),
    },
  ]);
  await db.insert(assignments).values({
    id: "99999999-9999-4999-8999-999999999999",
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    userId: DOULA_ID,
    role: "primary",
    status: "active",
  });

  await db.insert(clientPortalAccess).values({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    userId: CLIENT_USER_ID,
    email: JORDAN.email,
    status: "active",
    inviteSentAt: new Date(),
  });

  // Jordan is mid-care, not a fresh row (TOK-41): a consult on Maya's calendar, the
  // agreement that went out while it is pending, and the deposit invoice that agreement
  // opened — so the portal demos the real states instead of six empty ones in a row.
  //
  // Note the consult is still ahead: `fitConfirmed` is false, which is the point. A sent
  // agreement and an open invoice do not add up to booked care.
  const JORDAN_ENGAGEMENT_ID = "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a";
  const JORDAN_CONTRACT_ID = "1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b";
  const JORDAN_INVOICE_ID = "1c1c1c1c-1c1c-4c1c-8c1c-1c1c1c1c1c1c";

  await db.insert(engagements).values({
    id: JORDAN_ENGAGEMENT_ID,
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    packageLabel: "Birth support · full",
    amountCents: 280000,
    targetDate: edd.toISOString().slice(0, 10),
    locationLabel: "Arlington, VA",
    status: "open",
    // The field `resolveAssignedDoulaName` reads first, so every client surface names
    // Maya from the engagement rather than falling through to the assignment (TOK-38).
    primaryDoulaUserId: DOULA_ID,
  });

  const consultStart = weekdayMorningEastern(3, 11);
  const consultEnd = new Date(consultStart.getTime() + 45 * 60 * 1000);
  await db.insert(calendarEvents).values({
    id: "1d1d1d1d-1d1d-4d1d-8d1d-1d1d1d1d1d1d",
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    assigneeUserId: DOULA_ID,
    type: "consult",
    title: "Fit consult",
    startsAt: consultStart,
    endsAt: consultEnd,
    status: "scheduled",
    locationLabel: "Video or home visit — confirm in messages",
  });

  const agreementSentAt = hoursAgo(20);
  await db.insert(contracts).values({
    id: JORDAN_CONTRACT_ID,
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    engagementId: JORDAN_ENGAGEMENT_ID,
    packageLabel: "Birth support · full",
    amountCents: 280000,
    status: "sent",
    sentAt: agreementSentAt,
  });
  await db.insert(contractEvents).values({
    id: "1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e",
    organizationId: ORG_ID,
    contractId: JORDAN_CONTRACT_ID,
    type: "sent",
    actorUserId: DOULA_ID,
    at: agreementSentAt,
  });

  await db.insert(invoices).values({
    id: JORDAN_INVOICE_ID,
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    contractId: JORDAN_CONTRACT_ID,
    engagementId: JORDAN_ENGAGEMENT_ID,
    number: "NOVA-1001",
    status: "open",
    amountCents: 90000,
    dueAt: daysFromNow(7),
  });
  await db.insert(invoiceLines).values({
    id: "1f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f",
    organizationId: ORG_ID,
    invoiceId: JORDAN_INVOICE_ID,
    description: "Deposit — birth support package",
    quantity: 1,
    unitAmountCents: 90000,
  });

  // A prenatal note Maya started before the visit rather than after it (TOK-44): the
  // consult is still ahead, so the only answers in it are the ones she already had from
  // the enquiry. It is a `draft`, which is the state that matters — nothing is signed, so
  // nothing is locked, and TOK-43 has a real row to render instead of an empty chart.
  //
  // Answers are parsed against the field defs on the way in, so a key typo fails the seed
  // instead of quietly writing a question no form asks.
  const jordanVisitNoteAnswers = parseChartAnswers("prenatal_visit", "draft", {
    visit_date: consultStart.toISOString().slice(0, 10),
    client_first_name: "Jordan",
    client_last_name: "Rivera",
    estimated_due_date: edd.toISOString().slice(0, 10),
    partner_name: "Sam Rivera",
    care_provider_name: "Dr. A. Okonkwo",
    care_provider_practice: "Arlington OB",
    expected_birth_place: "Virginia Hospital Center",
  });
  const JORDAN_VISIT_NOTE_ID = "2a2a2a2a-2a2a-4a2a-8a2a-2a2a2a2a2a2a";
  await db.insert(visitNotes).values({
    id: JORDAN_VISIT_NOTE_ID,
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    engagementId: JORDAN_ENGAGEMENT_ID,
    authorUserId: DOULA_ID,
    kind: "prenatal",
    status: "draft",
    visitDate: consultStart.toISOString().slice(0, 10),
    answers: jordanVisitNoteAnswers,
    // Left at the column default on purpose: staff_only. A family sees no chart.
  });
  await db.insert(auditLogs).values({
    id: "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b",
    organizationId: ORG_ID,
    actorUserId: DOULA_ID,
    action: CHART_AUDIT_ACTIONS.created,
    entityType: CHART_ENTITY_TYPES.visitNote,
    entityId: JORDAN_VISIT_NOTE_ID,
    metadata: chartAuditMetadata({
      entityType: CHART_ENTITY_TYPES.visitNote,
      clientId: CLIENT_ID,
      engagementId: JORDAN_ENGAGEMENT_ID,
      version: 1,
      sharePolicy: "staff_only",
    }),
  });

  // Jordan's birth preferences, signed and handed back (TOK-45). This is the one chart
  // document Faith's K1 opens to a family: their own answers, under
  // `preferences_shareable`, which is what `/portal/passport` reads. Everything else on
  // the chart stays `staff_only` — the visit note above is the proof.
  const jordanCarePlanAnswers = parseChartAnswers("care_plan", "signed", {
    early_labor_non_medical: ["labor_at_home", "shower_or_jacuzzi", "birth_ball", "music"],
    early_labor_medical: ["intermittent_monitoring", "heparin_lock", "vaginal_checks_limited"],
    medication_code_word: "pineapple",
    birth_choices: [
      "parent_chooses_position",
      "delayed_cord_clamping",
      "cord_cut_by_partner",
      "baby_on_chest_immediately",
      "delay_newborn_procedures",
    ],
    newborn_procedures: ["vitamin_k", "eye_ointment"],
    know_gender: "surprise",
    circumcising: "no",
    keeping_placenta: "no",
    doula_first_name: "Maya",
    doula_last_name: "Chen",
    doula_signature: "Maya Chen",
  });
  const JORDAN_CARE_PLAN_ID = "2c2c2c2c-2c2c-4c2c-8c2c-2c2c2c2c2c2c";
  const carePlanSignedAt = new Date();
  carePlanSignedAt.setDate(carePlanSignedAt.getDate() - 3);
  await db.insert(carePlans).values({
    id: JORDAN_CARE_PLAN_ID,
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    engagementId: JORDAN_ENGAGEMENT_ID,
    authorUserId: DOULA_ID,
    status: "signed",
    answers: jordanCarePlanAnswers,
    sharePolicy: CARE_PLAN_SHAREABLE_POLICY,
    signedAt: carePlanSignedAt,
    signedByUserId: DOULA_ID,
  });
  await db.insert(auditLogs).values([
    {
      id: "2d2d2d2d-2d2d-4d2d-8d2d-2d2d2d2d2d2d",
      organizationId: ORG_ID,
      actorUserId: DOULA_ID,
      action: CHART_AUDIT_ACTIONS.signed,
      entityType: CHART_ENTITY_TYPES.carePlan,
      entityId: JORDAN_CARE_PLAN_ID,
      at: carePlanSignedAt,
      metadata: chartAuditMetadata({
        entityType: CHART_ENTITY_TYPES.carePlan,
        clientId: CLIENT_ID,
        engagementId: JORDAN_ENGAGEMENT_ID,
        version: 1,
        sharePolicy: "staff_only",
      }),
    },
    {
      id: "2e2e2e2e-2e2e-4e2e-8e2e-2e2e2e2e2e2e",
      organizationId: ORG_ID,
      actorUserId: DOULA_ID,
      action: CHART_AUDIT_ACTIONS.shared,
      entityType: CHART_ENTITY_TYPES.carePlan,
      entityId: JORDAN_CARE_PLAN_ID,
      at: carePlanSignedAt,
      metadata: chartAuditMetadata({
        entityType: CHART_ENTITY_TYPES.carePlan,
        clientId: CLIENT_ID,
        engagementId: JORDAN_ENGAGEMENT_ID,
        version: 1,
        sharePolicy: CARE_PLAN_SHAREABLE_POLICY,
        capability: "share",
        relationship: "primary_doula",
      }),
    },
  ]);

  const averyEdd = new Date();
  averyEdd.setDate(averyEdd.getDate() + 35);
  await db.insert(clients).values({
    id: AVERY_CLIENT_ID,
    organizationId: ORG_ID,
    displayName: AVERY.name,
    preferredName: "Avery",
    email: AVERY.email,
    phone: "(571) 555-0144",
    source: "website",
    edd: averyEdd.toISOString().slice(0, 10),
    city: "Alexandria",
    region: "VA",
    postalCode: "22301",
    // Avery is the overdue one: a follow-up that slipped four days ago, nobody named
    // primary, and no founder review yet — three Needs Attention rules on one row.
    serviceType: "postpartum",
    insurance: "unknown",
    consultDate: null,
    lastContactAt: daysFromNow(-11),
    followUpDueOn: dateFromNow(-4),
    intakeRef: "PSAF-1002",
    ownerUserId: DOULA_ID,
    reviewed: false,
  });
  // Avery is a step behind Jordan: intro sent, no consult booked yet, so the pipeline has
  // two clients in two different places instead of a column of identical rows (TOK-41).
  await db.insert(pipelineStages).values({
    id: "77777777-7777-4777-8777-777777777778",
    organizationId: ORG_ID,
    clientId: AVERY_CLIENT_ID,
    stage: "outreach_sent",
    enteredAt: daysFromNow(-11),
  });
  await db.insert(pipelineEvents).values([
    {
      id: "88888888-8888-4888-8888-888888888889",
      organizationId: ORG_ID,
      clientId: AVERY_CLIENT_ID,
      fromStage: null,
      toStage: "new_lead",
      reason: "seed",
      at: daysFromNow(-14),
    },
    {
      id: "88888888-8888-4888-8888-88888888888c",
      organizationId: ORG_ID,
      clientId: AVERY_CLIENT_ID,
      fromStage: "new_lead",
      toStage: "outreach_sent",
      reason: "seed",
      at: daysFromNow(-11),
    },
  ]);
  // Avery is Maya's, with Priya backing her up. The second row is what makes the two
  // shells provable side by side (TOK-34): Priya signs in to a doula shell with one
  // family on it, while Maya's owner board is org-wide and still shows Avery as the
  // family nobody has been named primary on.
  await db.insert(assignments).values([
    {
      id: "99999999-9999-4999-8999-999999999990",
      organizationId: ORG_ID,
      clientId: AVERY_CLIENT_ID,
      userId: DOULA_ID,
      role: "primary",
      status: "active",
    },
    {
      id: "99999999-9999-4999-8999-999999999991",
      organizationId: ORG_ID,
      clientId: AVERY_CLIENT_ID,
      userId: PRIYA_USER_ID,
      role: "backup",
      status: "active",
    },
  ]);
  await db.insert(clientPortalAccess).values({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
    organizationId: ORG_ID,
    clientId: AVERY_CLIENT_ID,
    userId: AVERY_USER_ID,
    email: AVERY.email,
    status: "active",
    inviteSentAt: new Date(),
  });

  /**
   * Two leads with no portal login, so the board has the two shapes the Needs Attention
   * rules exist for (TOK-49): a consult that happened and was never written up, and an
   * overdue follow-up on a record nobody owns.
   *
   * Invented people. Their addresses are on `example.invalid`, which cannot receive mail,
   * so a demo seed can never send to a real inbox.
   */
  await db.insert(clients).values([
    {
      id: NOOR_CLIENT_ID,
      organizationId: ORG_ID,
      displayName: "Noor Vandermeer",
      preferredName: "Noor",
      email: "noor.vandermeer@example.invalid",
      phone: "(571) 555-0161",
      source: "referral",
      edd: dateFromNow(84),
      city: "Falls Church",
      region: "VA",
      postalCode: "22042",
      serviceType: "overnight",
      hospital: "Inova Fairfax",
      assignedProvider: "Midwife L. Barrett",
      insurance: "yes",
      insuranceProvider: "Aetna",
      consultDate: dateFromNow(-2),
      lastContactAt: daysFromNow(-2),
      followUpDueOn: dateFromNow(1),
      intakeRef: "PSAF-1003",
      ownerUserId: PRIYA_USER_ID,
      reviewed: false,
    },
    {
      id: TAMSIN_CLIENT_ID,
      organizationId: ORG_ID,
      displayName: "Tamsin Okafor",
      preferredName: "Tamsin",
      email: "tamsin.okafor@example.invalid",
      phone: "(571) 555-0177",
      source: "event",
      edd: dateFromNow(140),
      city: "Vienna",
      region: "VA",
      postalCode: "22180",
      serviceType: "childbirth_class",
      insurance: "no",
      lastContactAt: daysFromNow(-15),
      followUpDueOn: dateFromNow(-9),
      intakeRef: "PSAF-1004",
      reviewed: false,
    },
  ]);
  await db.insert(pipelineStages).values([
    {
      id: "77777777-7777-4777-8777-77777777777a",
      organizationId: ORG_ID,
      clientId: NOOR_CLIENT_ID,
      stage: "consult_done",
      enteredAt: daysFromNow(-2),
    },
    {
      id: "77777777-7777-4777-8777-77777777777b",
      organizationId: ORG_ID,
      clientId: TAMSIN_CLIENT_ID,
      stage: "new_lead",
      enteredAt: daysFromNow(-15),
    },
  ]);
  await db.insert(pipelineEvents).values([
    {
      id: "88888888-8888-4888-8888-88888888888f",
      organizationId: ORG_ID,
      clientId: NOOR_CLIENT_ID,
      fromStage: null,
      toStage: "new_lead",
      reason: "seed",
      at: daysFromNow(-10),
    },
    {
      id: "88888888-8888-4888-8888-888888888890",
      organizationId: ORG_ID,
      clientId: NOOR_CLIENT_ID,
      fromStage: "new_lead",
      toStage: "outreach_sent",
      reason: "seed",
      at: daysFromNow(-8),
    },
    {
      id: "88888888-8888-4888-8888-888888888891",
      organizationId: ORG_ID,
      clientId: NOOR_CLIENT_ID,
      fromStage: "outreach_sent",
      toStage: "consult_scheduled",
      reason: "seed",
      at: daysFromNow(-6),
    },
    {
      id: "88888888-8888-4888-8888-888888888892",
      organizationId: ORG_ID,
      clientId: NOOR_CLIENT_ID,
      // Entered consult_done two days ago and nothing has been logged since — the rule
      // NOVA describes as "note in by 4pm".
      fromStage: "consult_scheduled",
      toStage: "consult_done",
      reason: "seed",
      at: daysFromNow(-2),
    },
    {
      id: "88888888-8888-4888-8888-888888888893",
      organizationId: ORG_ID,
      clientId: TAMSIN_CLIENT_ID,
      fromStage: null,
      toStage: "new_lead",
      reason: "seed",
      at: daysFromNow(-15),
    },
  ]);

  const weekdays = [1, 2, 3, 4, 5];
  await db.insert(availability).values(
    weekdays.map((weekday, index) => ({
      id: `bbbbbbb${index}-bbbb-4bbb-8bbb-bbbbbbbbbbb${index}`,
      organizationId: ORG_ID,
      userId: DOULA_ID,
      weekday,
      startMinutes: 10 * 60,
      endMinutes: 16 * 60,
      timezone: "America/New_York",
    })),
  );

  const intakeId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const preferencesId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const postpartumId = "cccccccc-cccc-4ccc-8ccc-ccccccccccce";
  // TOK-50: family worksheets, ported from the Dubsado crawl with the EHR chrome cut.
  const partnerExpectationsId = "cccccccc-cccc-4ccc-8ccc-ccccccccccd1";
  const intakeWorksheetId = "cccccccc-cccc-4ccc-8ccc-ccccccccccd2";
  // TOK-50: staff work. These carry `audience: "staff"` and may never be assigned into a
  // family portal — Dubsado put its postpartum visit and its Birth Log on the *client's*
  // Incomplete list, so a family opened someone else's homework written in someone
  // else's voice. The audience column, the assign guards and the portal reads all agree.
  const prenatalNotesId = "cccccccc-cccc-4ccc-8ccc-ccccccccccd3";
  const postpartumVisitId = "cccccccc-cccc-4ccc-8ccc-ccccccccccd4";
  const seniorCheckInId = "cccccccc-cccc-4ccc-8ccc-ccccccccccd5";
  const birthLogId = "cccccccc-cccc-4ccc-8ccc-ccccccccccd6";
  await db.insert(formTemplates).values([
    {
      id: intakeId,
      organizationId: ORG_ID,
      title: "Getting-to-know-you",
      kind: "intake",
      audience: "family",
      schemaJson: {
        fields: [
          { id: "preferred_name", label: "What should we call you?", type: "text" },
          {
            id: "support_style",
            label: "How do you want company during labor?",
            type: "textarea",
          },
          {
            id: "household_notes",
            label: "Anyone else we should know about on the team at home?",
            type: "textarea",
          },
        ],
      },
    },
    {
      id: preferencesId,
      organizationId: ORG_ID,
      title: "Birth preferences",
      kind: "expectations",
      audience: "family",
      schemaJson: {
        fields: [
          {
            id: "atmosphere",
            label: "What would help the room feel like yours?",
            type: "textarea",
          },
          {
            id: "after_birth",
            label: "First hours after birth — what matters most?",
            type: "textarea",
          },
        ],
      },
    },
    {
      id: postpartumId,
      organizationId: ORG_ID,
      title: "First two weeks at home",
      kind: "postpartum",
      audience: "family",
      schemaJson: {
        // The last two are marked sensitive so the seeded demo shows the badge and the
        // "answers never leave the portal" rule against real content, not a placeholder.
        fields: [
          {
            id: "help_window",
            label: "Which days do you most want someone in the house?",
            type: "text",
          },
          {
            id: "household_notes",
            label: "Who is bringing food, and who should we not let in?",
            type: "textarea",
            sensitive: true,
          },
          {
            id: "quiet_context",
            label: "Anything you want held quietly between us?",
            type: "textarea",
            sensitive: true,
          },
        ],
      },
    },
    {
      // Dubsado called this "Support and Expectation Questionnaire (Birth Partner)".
      // The questions underneath were already human; only the chrome around them was
      // not. The partner signs their own name — nothing about "completing this record".
      id: partnerExpectationsId,
      organizationId: ORG_ID,
      title: "Birth partner expectations",
      kind: "expectations",
      audience: "family",
      schemaJson: {
        fields: [
          {
            id: "partner_role",
            label: "What role do you want to take at the birth?",
            type: "textarea",
          },
          {
            id: "doula_role",
            label: "What would you most like Maya to do for you on the day?",
            type: "textarea",
          },
          {
            id: "thoughts_now",
            label: "How are you feeling about the pregnancy and the birth coming up?",
            type: "textarea",
          },
          {
            id: "your_needs",
            label: "What do you think you will need during labor and delivery?",
            type: "textarea",
          },
          {
            id: "birth_background",
            label: "Have you been at a birth before, or is this your first?",
            type: "textarea",
          },
          {
            id: "serve_you_better",
            label: "Anything else that would help us support you well?",
            type: "textarea",
          },
          {
            id: "questions",
            label: "Questions you want answered before the day",
            type: "textarea",
          },
          {
            id: "partner_signature",
            label: "Sign your name",
            type: "text",
          },
        ],
      },
    },
    {
      // The 14-page Dubsado intake, cut to a worksheet a family can actually finish.
      // Headings are the family's own words for their own answers — "Your health",
      // "This pregnancy", "About birth" — not hospital intake vocabulary, and the
      // "Birth Concierge" role name is gone. The closing line keeps Dubsado's one good
      // idea: tell the family which forms are not hers, so she does not open empty
      // staff work and think she is behind.
      id: intakeWorksheetId,
      organizationId: ORG_ID,
      title: "Your birth plan worksheet",
      kind: "intake",
      audience: "family",
      schemaJson: {
        fields: [
          {
            id: "intro",
            label:
              "Help us know what matters for your pregnancy and birth. You will talk all of this through with Maya — nothing here is a final decision.",
            type: "textarea",
          },
          { id: "due_date", label: "Estimated due date", type: "date" },
          {
            id: "birth_setting",
            label: "Where are you planning to give birth — home, birth center, or hospital?",
            type: "text",
          },
          {
            id: "care_provider",
            label: "Who is your primary care provider, and where do they practice?",
            type: "text",
          },
          {
            id: "first_baby",
            label: "Is this your first baby? If not, who else is at home?",
            type: "textarea",
          },
          {
            id: "labor_care_plan",
            label: "Who is looking after other children or pets while you are in labor?",
            type: "textarea",
          },
          {
            id: "classes",
            label: "Any childbirth or feeding classes you have taken",
            type: "textarea",
          },
          {
            id: "your_health",
            label: "Your health — anything ongoing we should know about",
            type: "textarea",
            sensitive: true,
          },
          {
            id: "allergies",
            label: "Allergies — medication, food, latex",
            type: "textarea",
            sensitive: true,
          },
          {
            id: "this_pregnancy",
            label: "This pregnancy — how it has gone so far",
            type: "textarea",
            sensitive: true,
          },
          {
            id: "past_births",
            label: "Births before this one, if any — what you want us to know",
            type: "textarea",
            sensitive: true,
          },
          {
            id: "about_birth_vision",
            label: "About birth — what is your vision for this one?",
            type: "textarea",
          },
          {
            id: "doula_expectations",
            label: "What do you want from Maya on the day?",
            type: "textarea",
          },
          {
            id: "tension",
            label: "Where do you hold tension, and how does it show?",
            type: "textarea",
          },
          {
            id: "comfort_self",
            label: "How do you comfort yourself when something hurts or scares you?",
            type: "textarea",
          },
          {
            id: "pain_plan",
            label: "Your plan for coping with the pain of labor",
            type: "textarea",
          },
          {
            id: "medication_response",
            label: "If you ask for pain medication, how do you want Maya to respond?",
            type: "textarea",
          },
          {
            id: "cultural_preferences",
            label: "Cultural or religious choices that matter for your birth",
            type: "textarea",
          },
          {
            id: "anything_else",
            label: "Anything else that would help us support you",
            type: "textarea",
          },
          {
            id: "closing",
            label:
              "That is everything we need from you. Anything in your portal that starts with a doula's name is Maya's to fill in on a visit — please leave those for her. After you submit, changes go through Maya.",
            type: "textarea",
          },
          { id: "signature", label: "Sign your name", type: "text" },
        ],
      },
    },
    {
      // Staff. Dubsado already warned families to leave this one alone; the audience
      // column means we never have to warn anybody, because she never sees it.
      id: prenatalNotesId,
      organizationId: ORG_ID,
      title: "Prenatal visit notes",
      kind: "visit",
      audience: "staff",
      schemaJson: {
        fields: [
          { id: "visit_date", label: "Date of the visit", type: "date" },
          { id: "covered", label: "What you covered together", type: "textarea" },
          { id: "follow_up", label: "What to pick up next time", type: "textarea" },
        ],
      },
    },
    {
      // Staff. "Log the postpartum visit" is a doula's task, not a family's Incomplete.
      id: postpartumVisitId,
      organizationId: ORG_ID,
      title: "Birth doula postpartum visit",
      kind: "visit",
      audience: "staff",
      schemaJson: {
        fields: [
          { id: "birthing_person", label: "Birthing person", type: "text" },
          { id: "baby_name", label: "Baby's name", type: "text" },
          { id: "visit_date", label: "Date of the postpartum visit", type: "date" },
          {
            id: "wants_help_with",
            label:
              "What they want connecting with — lactation support, postpartum doula, PPMD specialist, something else",
            type: "textarea",
          },
          {
            id: "continuing_support",
            label: "Anything else we should know to keep supporting them",
            type: "textarea",
          },
        ],
      },
    },
    {
      // Staff. Senior package check-in timing is agency ops copy — it stays back here.
      id: seniorCheckInId,
      organizationId: ORG_ID,
      title: "Senior birth team postpartum check-in",
      kind: "visit",
      audience: "staff",
      schemaJson: {
        fields: [
          { id: "birthing_person", label: "Birthing person", type: "text" },
          { id: "baby_name", label: "Baby's name", type: "text" },
          { id: "check_in_date", label: "Date of the check-in", type: "date" },
          { id: "support_package", label: "Support package on the engagement", type: "text" },
          {
            id: "wants_help_with",
            label: "What they want connecting with",
            type: "textarea",
          },
          {
            id: "continuing_support",
            label: "Anything else we should know to keep supporting them",
            type: "textarea",
          },
        ],
      },
    },
    {
      // Staff, and it stays clinical. The Birth Log is the chart — dilation, timings,
      // what was tried. It is not a family keepsake and it is not renamed into one: a
      // birth story for the family is a different surface, written on purpose, not this
      // grid with a friendlier label on it (TOK-50 / TOK-44).
      id: birthLogId,
      organizationId: ORG_ID,
      title: "Birth log",
      kind: "log",
      audience: "staff",
      schemaJson: {
        fields: [
          { id: "labor_start", label: "Labor start", type: "text" },
          { id: "arrival", label: "Arrival at place of birth", type: "text" },
          { id: "progress", label: "Progress and timings", type: "textarea" },
          { id: "interventions", label: "Interventions and response", type: "textarea" },
          { id: "birth_time", label: "Time of birth", type: "text" },
          { id: "staff_notes", label: "Notes for the chart", type: "textarea" },
        ],
      },
    },
  ]);

  await db.insert(formAssignments).values([
    {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      organizationId: ORG_ID,
      templateId: intakeId,
      clientId: CLIENT_ID,
      status: "incomplete",
      assigneeRole: "either",
    },
    {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      organizationId: ORG_ID,
      templateId: preferencesId,
      clientId: CLIENT_ID,
      status: "incomplete",
      assigneeRole: "either",
    },
    {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef",
      organizationId: ORG_ID,
      templateId: intakeId,
      clientId: AVERY_CLIENT_ID,
      status: "incomplete",
      assigneeRole: "either",
    },
    {
      id: "ffffffff-ffff-4fff-8fff-fffffffffffe",
      organizationId: ORG_ID,
      templateId: preferencesId,
      clientId: AVERY_CLIENT_ID,
      status: "incomplete",
      assigneeRole: "either",
    },
    // Third open form each, so the co-complete path (TOK-27) has something to demo
    // without first emptying the family's own queue.
    {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee0",
      organizationId: ORG_ID,
      templateId: postpartumId,
      clientId: CLIENT_ID,
      status: "incomplete",
      assigneeRole: "doula",
    },
    {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
      organizationId: ORG_ID,
      templateId: postpartumId,
      clientId: AVERY_CLIENT_ID,
      status: "incomplete",
      assigneeRole: "doula",
    },
    // TOK-50: the partner's own form, so the family portal demonstrates a second reader
    // in the household. Every id above and below is a `family` template — the four staff
    // templates are seeded into the library and assigned to nobody, because a staff form
    // on a family's Incomplete list is the exact Dubsado bug this milestone refuses.
    {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
      organizationId: ORG_ID,
      templateId: partnerExpectationsId,
      clientId: CLIENT_ID,
      status: "incomplete",
      assigneeRole: "client",
    },
  ]);

  const resourceId = "12121212-1212-4121-8121-121212121212";
  const comfortResourceId = "12121212-1212-4121-8121-121212121213";
  await db.insert(resources).values([
    {
      id: resourceId,
      organizationId: ORG_ID,
      // Written in Maya's own voice: a family reads a person here, never "your doula"
      // (TOK-38 B11). The title says whose handout it is, so it cannot collide with the
      // comfort checklist below in the portal list (TOK-41 G7).
      title: "What Maya does (and does not do)",
      kind: "handout",
      body: "I stay with you, help you change positions, talk with your partner, and keep the plan visible. I do not perform clinical exams and I do not speak for your medical team — that stays with your midwife or doctor.",
      tags: ["welcome", "expectations"],
    },
    {
      id: comfortResourceId,
      organizationId: ORG_ID,
      title: "Comfort measures to practice before labor",
      kind: "checklist",
      body: "Ten minutes a day is enough: slow breathing with a long exhale, hip squeezes with your partner, leaning forward over the counter, warm compress on the low back, and a playlist you actually like. Practice while nothing hurts so your body knows the moves later.",
      tags: ["comfort", "labor", "partner"],
    },
  ]);
  // Both seeded families sit behind the resource gate (TOK-39 E2): Jordan's agreement is
  // `sent` with an open deposit, Avery has no agreement at all. That is the demo, not a
  // hole in it — sign Jordan's agreement and clear the stub payment at /stub/pay and the
  // handouts below open live, which is the whole rule in two clicks.
  await db.insert(resourceShares).values([
    {
      id: "13131313-1313-4131-8131-131313131313",
      organizationId: ORG_ID,
      resourceId,
      clientId: CLIENT_ID,
    },
    {
      id: "13131313-1313-4131-8131-131313131314",
      organizationId: ORG_ID,
      resourceId,
      clientId: AVERY_CLIENT_ID,
    },
    // Jordan gets the second resource read, Avery's stays unread, so the doula library
    // shows both sides of the read counter out of the box.
    {
      id: "13131313-1313-4131-8131-131313131315",
      organizationId: ORG_ID,
      resourceId: comfortResourceId,
      clientId: CLIENT_ID,
      completedAt: new Date(),
    },
    {
      id: "13131313-1313-4131-8131-131313131316",
      organizationId: ORG_ID,
      resourceId: comfortResourceId,
      clientId: AVERY_CLIENT_ID,
    },
  ]);

  // Stamped relative to now (see `hoursAgo`) so the thread reads as a conversation with a
  // shape — the welcome yesterday, the family's reply this morning — not three lines at once.
  await db.insert(portalMessages).values([
    {
      id: "14141414-1414-4141-8141-141414141414",
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      fromUserId: DOULA_ID,
      direction: "outbound",
      body: "Jordan — good to meet you. I have us down for the fit consult, and I sent the care agreement so you can read it beforehand. No rush on signing; nothing is settled until we have talked.",
      sentAt: hoursAgo(28),
    },
    {
      id: "14141414-1414-4141-8141-141414141415",
      organizationId: ORG_ID,
      clientId: AVERY_CLIENT_ID,
      fromUserId: DOULA_ID,
      direction: "outbound",
      body: "Avery — welcome. Your portal is ready when you want to book a fit consult. No pressure.",
      sentAt: hoursAgo(28),
    },
    // Jordan writes back, so the thread is two-way out of the box: her line sits unread on
    // the doula inbox, and Maya's welcome sits unread on Jordan's Home checklist (TOK-28).
    {
      id: "14141414-1414-4141-8141-141414141416",
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      fromUserId: CLIENT_USER_ID,
      direction: "inbound",
      body: "Thank you! I read through the agreement last night. Is the deposit due before our consult or after? And what does a fit consult usually cover?",
      sentAt: hoursAgo(3),
    },
  ]);

  const templates = [
    {
      triggerKey: "client_welcome",
      name: "Client welcome",
      subject: "Welcome to {{org_name}}",
      text: "Hi {{client_name}}, {{doula_name}} shared an introduction with you. Open your portal: {{portal_url}}",
    },
    {
      triggerKey: "client_portal_invite",
      name: "Client portal invite",
      subject: "Your NOVA client portal is ready",
      text: "Hi {{client_name}}, sign in at {{portal_url}} to see your checklist.",
    },
    {
      triggerKey: "agreement_sent",
      name: "Agreement sent",
      subject: "Your care agreement is ready to sign",
      text: "Hi {{client_name}}, your care agreement is ready. Review and sign it in your portal: {{sign_url}}",
    },
    {
      triggerKey: "invoice_due",
      name: "Invoice due",
      subject: "Invoice {{invoice_number}} is ready",
      text: "Hi {{client_name}}, pay invoice {{invoice_number}} in your portal: {{portal_url}}",
    },
    {
      triggerKey: "doula_invited",
      name: "Doula invited",
      subject: "You are invited to join {{org_name}} on Tokos",
      text: "You have been invited to {{org_name}} as {{invite_role}}. Accept here: {{invite_url}}",
    },
    {
      triggerKey: "form_reminder",
      name: "Form reminder",
      subject: "A form is waiting in your portal",
      text: "Hi {{client_name}}, finish your forms here: {{portal_url}}",
    },
  ];

  for (const template of templates) {
    const id = crypto.randomUUID();
    const html = `<p>${template.text.replaceAll("\n", "</p><p>")}</p><p>NOVA Birth Partners</p>`;
    await db.insert(emailTemplates).values({
      id,
      organizationId: ORG_ID,
      triggerKey: template.triggerKey,
      name: template.name,
      enabled: true,
      fromName: "NOVA Birth Partners",
      replyTo: "hello@novabirthpartners.com",
      subjectTpl: template.subject,
      bodyTextTpl: template.text,
      bodyHtmlTpl: html,
    });
    await db.insert(emailTemplateVersions).values({
      id: crypto.randomUUID(),
      templateId: id,
      version: 1,
      subjectTpl: template.subject,
      bodyTextTpl: template.text,
      bodyHtmlTpl: html,
      authoredByUserId: DOULA_ID,
    });
  }

  // Cedar is the second tenant every isolation check runs against, but its own families
  // read its footer — so the footer says where Cedar practises, not what we use it for.
  await db.insert(organizations).values({
    id: CEDAR_ORG_ID,
    name: "Cedar Birth Collective",
    slug: "cedar-birth-collective",
    timezone: "America/New_York",
    portalName: "Cedar Birth Prep",
    primaryColor: CEDAR_PRIMARY,
    confidentialityBlurb:
      "What you share in this portal stays between you and your Cedar team. Sensitive notes never go out in email.",
    footerHtml: "Cedar Birth Collective · Richmond",
  });
  await db.insert(memberships).values({
    id: "55555555-5555-4555-8555-555555555556",
    organizationId: CEDAR_ORG_ID,
    userId: CEDAR_STAFF_ID,
    role: "owner",
  });
  await db.insert(providerProfiles).values({
    id: "66666666-6666-4666-8666-666666666667",
    organizationId: CEDAR_ORG_ID,
    userId: CEDAR_STAFF_ID,
    slug: "sam-ortega",
    headline: "Birth and postpartum support across Richmond",
    bio: "I walk with families through late pregnancy, labor, and the first weeks home. Practical, unhurried, and clear about what is mine to do and what belongs to your medical team.",
    serviceArea: "Richmond and Petersburg",
    ratesLabel: "Birth package from $2,400",
    published: true,
  });
  await seedProviderPhoto({
    organizationId: CEDAR_ORG_ID,
    userId: CEDAR_STAFF_ID,
    name: SAM.name,
    photoFile: "sam-ortega.jpg",
  });
  await db.insert(clients).values({
    id: CEDAR_CLIENT_ID,
    organizationId: CEDAR_ORG_ID,
    displayName: RILEY.name,
    preferredName: "Riley",
    email: RILEY.email,
    source: "website",
    city: "Richmond",
    region: "VA",
    serviceType: "birth_support",
    insurance: "unknown",
    followUpDueOn: dateFromNow(2),
    lastContactAt: hoursAgo(48),
    intakeRef: "BDQ-2001",
    ownerUserId: CEDAR_STAFF_ID,
    reviewed: false,
  });
  await db.insert(pipelineStages).values({
    id: "77777777-7777-4777-8777-777777777779",
    organizationId: CEDAR_ORG_ID,
    clientId: CEDAR_CLIENT_ID,
    stage: "new_lead",
  });
  await db.insert(pipelineEvents).values({
    id: "88888888-8888-4888-8888-888888888880",
    organizationId: CEDAR_ORG_ID,
    clientId: CEDAR_CLIENT_ID,
    fromStage: null,
    toStage: "new_lead",
    reason: "seed",
    at: daysFromNow(-5),
  });
  await db.insert(clientPortalAccess).values({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac",
    organizationId: CEDAR_ORG_ID,
    clientId: CEDAR_CLIENT_ID,
    userId: CEDAR_CLIENT_USER_ID,
    email: RILEY.email,
    status: "active",
    inviteSentAt: new Date(),
  });

  // Same lines the login page shows, so a smoke test cannot be sent to the wrong shell.
  const logins = demoLoginHintLines()
    .map((line) => `  ${line}`)
    .join("\n");
  const roster = DEMO_ACCOUNTS.map(
    (account) => `  ${account.name.padEnd(13)} ${account.email} / ${DEMO_PASSWORD}\n           ${account.note}`,
  ).join("\n");
  console.log(`Seeded NOVA Birth Partners + Cedar tenant.
${logins}

${roster}
  Cedar client id: ${CEDAR_CLIENT_ID}
  Profile: /p/maya-chen, /p/sam-ortega (both seeded with a provider photo — TOK-25),
           /p/priya-raman (no seeded headshot — she is the doula whose own upload the
           create-on-demand path had to stop dead-ending on, TOK-63)
  Pipeline: Jordan fit_confirmed, Avery outreach_sent (overdue follow-up, unmatched),
           Noor consult_done with no note, Tamsin new_lead 9 days overdue — the four
           shapes Needs Attention exists for (TOK-49)
  Import:   scripts/fixtures/nova-leads-sample.csv — 44 anonymized leads for /doula/clients/import
  Jordan:  fit consult booked with Maya, agreement sent, NOVA-1001 deposit open (TOK-41),
           engagement primary is Maya so every client surface names her (TOK-38)
  Forms:   9 templates — 5 family, 4 staff (TOK-50). Jordan and Avery only ever hold the
           family ones; the postpartum visit, senior check-in, prenatal notes and Birth
           log are staff work and are assigned to nobody
  Library: 2 resources; the comfort checklist is read by Jordan and unread by Avery
  Chart:   one draft prenatal visit note for Jordan, staff_only, unsigned (TOK-44), and
           her signed birth preferences shared back to her portal (TOK-45) — /portal/passport
  Portal:  Jordan's message thread is two-way out of the box (TOK-28) — Maya's welcome
           yesterday, Jordan's reply this morning, both still unread on their own side`);
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
