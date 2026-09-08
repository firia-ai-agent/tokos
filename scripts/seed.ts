import { hash } from "bcryptjs";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db";
import {
  assignments,
  availability,
  clientPortalAccess,
  clients,
  emailTemplates,
  emailTemplateVersions,
  formAssignments,
  formTemplates,
  memberships,
  organizations,
  pipelineEvents,
  pipelineStages,
  portalMessages,
  providerProfiles,
  resourceShares,
  resources,
  users,
} from "../src/db/schema";
import { saveProviderPhoto } from "../src/lib/provider-photo";
import { renderProviderPhotoPng } from "./provider-portrait";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const DOULA_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_USER_ID = "33333333-3333-4333-8333-333333333333";
const CLIENT_ID = "44444444-4444-4444-8444-444444444444";
const AVERY_USER_ID = "33333333-3333-4333-8333-333333333334";
const AVERY_CLIENT_ID = "44444444-4444-4444-8444-444444444445";
const CEDAR_ORG_ID = "11111111-1111-4111-8111-111111111112";
const CEDAR_STAFF_ID = "22222222-2222-4222-8222-222222222223";
const CEDAR_CLIENT_USER_ID = "33333333-3333-4333-8333-333333333336";
const CEDAR_CLIENT_ID = "44444444-4444-4444-8444-444444444446";
const DEMO_PASSWORD = "tokos-demo";
const NOVA_PRIMARY = "#2A7A78";
const CEDAR_PRIMARY = "#5C4A3A";

/**
 * Gives a seeded provider a photo through the real upload path, so a seeded photo and an
 * uploaded one are the same kind of row — S3 when keys are set, bytes on the `file_objects`
 * row when they are not — and a broken portrait fails the seed loudly instead of leaving a
 * profile the media route will 404.
 */
async function seedProviderPhoto(input: {
  organizationId: string;
  userId: string;
  name: string;
  baseColor: string;
}) {
  const png = renderProviderPhotoPng(input.baseColor);
  const result = await saveProviderPhoto({
    organizationId: input.organizationId,
    userId: input.userId,
    // A plain view, not the Buffer: `File` takes the same BlobPart a browser upload does.
    file: new File([new Uint8Array(png)], "provider-photo.png", { type: "image/png" }),
  });
  if (!result.ok) throw new Error(`seed photo rejected for ${input.name}: ${result.code}`);
}

async function main() {
  const db = getDb();
  const passwordHash = await hash(DEMO_PASSWORD, 10);

  await db.execute(sql`TRUNCATE TABLE
    invoice_lines, invoices, audit_logs, file_objects, outbox_messages,
    email_template_versions, email_templates, portal_messages, resource_shares,
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
    portalName: "NOVA Birth Partners",
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
      email: "maya@novabirthpartners.com",
      name: "Maya Chen",
      passwordHash,
      credentialsLabel: "CD(DONA)",
    },
    {
      id: CLIENT_USER_ID,
      email: "jordan.rivera@example.com",
      name: "Jordan Rivera",
      passwordHash,
    },
    {
      id: AVERY_USER_ID,
      email: "avery.kim@example.com",
      name: "Avery Kim",
      passwordHash,
    },
    {
      id: CEDAR_STAFF_ID,
      email: "sam@cedarbirth.co",
      name: "Sam Ortega",
      passwordHash,
      credentialsLabel: "CD(DONA)",
    },
    {
      id: CEDAR_CLIENT_USER_ID,
      email: "riley.voss@example.com",
      name: "Riley Voss",
      passwordHash,
    },
  ]);

  await db.insert(memberships).values({
    id: "55555555-5555-4555-8555-555555555555",
    organizationId: ORG_ID,
    userId: DOULA_ID,
    role: "owner",
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
    name: "Maya Chen",
    baseColor: NOVA_PRIMARY,
  });

  const edd = new Date();
  edd.setDate(edd.getDate() + 21);

  await db.insert(clients).values({
    id: CLIENT_ID,
    organizationId: ORG_ID,
    displayName: "Jordan Rivera",
    preferredName: "Jordan",
    email: "jordan.rivera@example.com",
    phone: "(571) 555-0199",
    source: "web",
    edd: edd.toISOString().slice(0, 10),
    city: "Arlington",
    region: "VA",
    alternateContactName: "Sam Rivera",
    alternateContactPhone: "(571) 555-0110",
  });

  await db.insert(pipelineStages).values({
    id: "77777777-7777-4777-8777-777777777777",
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    stage: "new_lead",
  });
  await db.insert(pipelineEvents).values({
    id: "88888888-8888-4888-8888-888888888888",
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    fromStage: null,
    toStage: "new_lead",
    reason: "seed",
  });
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
    email: "jordan.rivera@example.com",
    status: "active",
    inviteSentAt: new Date(),
  });

  const averyEdd = new Date();
  averyEdd.setDate(averyEdd.getDate() + 35);
  await db.insert(clients).values({
    id: AVERY_CLIENT_ID,
    organizationId: ORG_ID,
    displayName: "Avery Kim",
    preferredName: "Avery",
    email: "avery.kim@example.com",
    phone: "(571) 555-0144",
    source: "web",
    edd: averyEdd.toISOString().slice(0, 10),
    city: "Alexandria",
    region: "VA",
  });
  await db.insert(pipelineStages).values({
    id: "77777777-7777-4777-8777-777777777778",
    organizationId: ORG_ID,
    clientId: AVERY_CLIENT_ID,
    stage: "new_lead",
  });
  await db.insert(pipelineEvents).values({
    id: "88888888-8888-4888-8888-888888888889",
    organizationId: ORG_ID,
    clientId: AVERY_CLIENT_ID,
    fromStage: null,
    toStage: "new_lead",
    reason: "seed",
  });
  await db.insert(assignments).values({
    id: "99999999-9999-4999-8999-999999999990",
    organizationId: ORG_ID,
    clientId: AVERY_CLIENT_ID,
    userId: DOULA_ID,
    role: "primary",
    status: "active",
  });
  await db.insert(clientPortalAccess).values({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
    organizationId: ORG_ID,
    clientId: AVERY_CLIENT_ID,
    userId: AVERY_USER_ID,
    email: "avery.kim@example.com",
    status: "active",
    inviteSentAt: new Date(),
  });

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
  await db.insert(formTemplates).values([
    {
      id: intakeId,
      organizationId: ORG_ID,
      title: "Getting-to-know-you",
      kind: "intake",
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
      title: "Birth preferences (non-clinical)",
      kind: "expectations",
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
  ]);

  const resourceId = "12121212-1212-4121-8121-121212121212";
  await db.insert(resources).values({
    id: resourceId,
    organizationId: ORG_ID,
    title: "What a NOVA doula does (and does not do)",
    kind: "handout",
    body: "Your doula stays with you, helps you change positions, talks with your partner, and keeps the plan visible. Your doula does not perform clinical exams or speak for your medical team.",
    tags: ["welcome", "expectations"],
  });
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
  ]);

  await db.insert(portalMessages).values([
    {
      id: "14141414-1414-4141-8141-141414141414",
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      fromUserId: DOULA_ID,
      direction: "outbound",
      body: "Jordan — welcome. When you are ready, pick a fit consult on my calendar and we will see if we are the right match. No pressure.",
    },
    {
      id: "14141414-1414-4141-8141-141414141415",
      organizationId: ORG_ID,
      clientId: AVERY_CLIENT_ID,
      fromUserId: DOULA_ID,
      direction: "outbound",
      body: "Avery — welcome. Your portal is ready when you want to book a fit consult. No pressure.",
    },
  ]);

  const templates = [
    {
      triggerKey: "client_welcome",
      name: "Client welcome",
      subject: "Welcome to {{org_name}}",
      text: "Hi {{client_name}}, your doula shared an introduction. Open your portal: {{portal_url}}",
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
      text: "Hi {{client_name}}, review and sign in Tokos: {{sign_url}}",
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
      subject: "You are invited to Tokos",
      text: "You have been invited to the NOVA workspace. Sign in at {{portal_url}}",
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

  await db.insert(organizations).values({
    id: CEDAR_ORG_ID,
    name: "Cedar Birth Collective",
    slug: "cedar-birth-collective",
    timezone: "America/New_York",
    portalName: "Cedar Birth Collective",
    primaryColor: CEDAR_PRIMARY,
    confidentialityBlurb:
      "What you share in this portal stays between you and your Cedar team. Sensitive notes never go out in email.",
    footerHtml: "Cedar Birth Collective · IDOR probe tenant",
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
    name: "Sam Ortega",
    baseColor: CEDAR_PRIMARY,
  });
  await db.insert(clients).values({
    id: CEDAR_CLIENT_ID,
    organizationId: CEDAR_ORG_ID,
    displayName: "Riley Voss",
    preferredName: "Riley",
    email: "riley.voss@example.com",
    source: "web",
    city: "Richmond",
    region: "VA",
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
  });
  await db.insert(clientPortalAccess).values({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac",
    organizationId: CEDAR_ORG_ID,
    clientId: CEDAR_CLIENT_ID,
    userId: CEDAR_CLIENT_USER_ID,
    email: "riley.voss@example.com",
    status: "active",
    inviteSentAt: new Date(),
  });

  console.log(`Seeded NOVA Birth Partners + Cedar IDOR tenant.
  Doula:   maya@novabirthpartners.com / ${DEMO_PASSWORD}
  Client:  jordan.rivera@example.com / ${DEMO_PASSWORD}
  Client:  avery.kim@example.com / ${DEMO_PASSWORD}
  Cedar staff: sam@cedarbirth.co / ${DEMO_PASSWORD} (owner of Cedar — must not reach NOVA clients)
  Cedar:   riley.voss@example.com / ${DEMO_PASSWORD} (other org — Maya must not see)
  Cedar client id: ${CEDAR_CLIENT_ID}
  Profile: /p/maya-chen, /p/sam-ortega (both seeded with a provider photo — TOK-25)`);
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
