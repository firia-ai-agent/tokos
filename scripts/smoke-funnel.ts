import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db";
import { clients, pipelineStages } from "../src/db/schema";
import {
  confirmFit,
  markAgreementSigned,
  markInvoicePaid,
  sendContract,
  sendIntro,
  setPipelineStage,
} from "../src/lib/funnel";

const ORG = "11111111-1111-4111-8111-111111111111";
const DOULA = "22222222-2222-4222-8222-222222222222";
const CLIENT = "44444444-4444-4444-8444-444444444444";
const CLIENT_USER = "33333333-3333-4333-8333-333333333333";

async function stage() {
  const db = getDb();
  const [row] = await db.select().from(pipelineStages).where(eq(pipelineStages.clientId, CLIENT));
  return row?.stage;
}

async function main() {
  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, CLIENT));
  if (!client) throw new Error("seed client missing");

  if ((await stage()) === "new_lead") {
    await sendIntro({
      organizationId: ORG,
      clientId: CLIENT,
      actorUserId: DOULA,
      profileUrl: "http://127.0.0.1:43127/p/maya-chen",
    });
  }
  if ((await stage()) === "outreach_sent") {
    // The consult date gates `consult_scheduled` (TOK-49), so the smoke run sets one the
    // same way the lead form does before asking for the stage.
    await db
      .update(clients)
      .set({ consultDate: new Date().toISOString().slice(0, 10) })
      .where(eq(clients.id, CLIENT));
    const moved = await setPipelineStage({
      organizationId: ORG,
      clientId: CLIENT,
      actorUserId: DOULA,
      to: "consult_scheduled",
    });
    if (!moved.ok) throw new Error(`could not schedule consult: ${moved.reason}`);
  }
  if ((await stage()) === "consult_scheduled" || (await stage()) === "consult_done") {
    await confirmFit({ organizationId: ORG, clientId: CLIENT, actorUserId: DOULA });
    const sent = await sendContract({
      organizationId: ORG,
      clientId: CLIENT,
      actorUserId: DOULA,
    });
    await markAgreementSigned({
      organizationId: ORG,
      contractId: sent.contractId,
      actorUserId: CLIENT_USER,
    });
    if ((await stage()) !== "agreement_signed") {
      throw new Error(`expected agreement_signed after sign, got ${await stage()}`);
    }
    await markInvoicePaid({
      organizationId: ORG,
      invoiceId: sent.invoiceId,
      externalId: "stub-smoke",
      actorUserId: CLIENT_USER,
    });
  }

  const finalStage = await stage();
  if (finalStage !== "complete" && finalStage !== "active_care") {
    throw new Error(`expected complete, got ${finalStage}`);
  }
  console.log(`smoke ok: ${client.displayName} is ${finalStage}`);
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
