"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { resourceShares, resources } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { requireStaff, requireStaffClient } from "@/lib/tenancy";

const RESOURCE_KINDS = ["handout", "link", "checklist", "video"];

function revalidateResources(clientId?: string) {
  revalidatePath("/doula/resources");
  if (clientId) revalidatePath(`/doula/clients/${clientId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/resources");
}

/** Org-scoped read: a resource id posted from another tenant reads back as nothing. */
async function loadResource(organizationId: string, resourceId: string) {
  if (!resourceId) return null;
  const db = getDb();
  const [resource] = await db
    .select()
    .from(resources)
    .where(and(eq(resources.id, resourceId), eq(resources.organizationId, organizationId)))
    .limit(1);
  return resource ?? null;
}

export async function createResourceAction(formData: FormData) {
  const staff = await requireStaff();
  const title = String(formData.get("title") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "handout").trim();
  const kind = RESOURCE_KINDS.includes(kindRaw) ? kindRaw : "handout";
  const url = String(formData.get("url") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);

  if (!title) redirect("/doula/resources?error=title");
  if (!url && !body) redirect("/doula/resources?error=empty");

  const db = getDb();
  const id = newId();
  await db.insert(resources).values({
    id,
    organizationId: staff.organizationId,
    title,
    kind,
    url: url || null,
    body: body || null,
    tags: tags.length > 0 ? tags : null,
  });
  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "resource.created",
    entityType: "resource",
    entityId: id,
    metadata: { kind },
  });

  revalidateResources();
  redirect("/doula/resources?created=resource");
}

export async function shareResourceAction(formData: FormData) {
  const resourceId = String(formData.get("resourceId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  if (!resourceId || !clientId) redirect("/doula/resources?error=share");

  const { staff, client } = await requireStaffClient(clientId);
  const resource = await loadResource(staff.organizationId, resourceId);
  if (!resource) redirect("/doula/resources?error=share");

  const db = getDb();
  const [existing] = await db
    .select()
    .from(resourceShares)
    .where(
      and(
        eq(resourceShares.organizationId, staff.organizationId),
        eq(resourceShares.resourceId, resource.id),
        eq(resourceShares.clientId, client.id),
      ),
    )
    .limit(1);
  if (existing) {
    revalidateResources(client.id);
    redirect("/doula/resources?error=duplicate");
  }

  const id = newId();
  await db.insert(resourceShares).values({
    id,
    organizationId: staff.organizationId,
    resourceId: resource.id,
    clientId: client.id,
  });
  await writeAudit({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    action: "resource.shared",
    entityType: "resource_share",
    entityId: id,
    metadata: { client_id: client.id, resource_id: resource.id },
  });

  revalidateResources(client.id);
  redirect("/doula/resources?created=share");
}

export async function unshareResourceAction(formData: FormData) {
  const staff = await requireStaff();
  const shareId = String(formData.get("shareId") ?? "");
  if (!shareId) return;

  const db = getDb();
  const [share] = await db
    .select()
    .from(resourceShares)
    .where(
      and(
        eq(resourceShares.id, shareId),
        eq(resourceShares.organizationId, staff.organizationId),
      ),
    )
    .limit(1);
  if (!share) return;

  await db.delete(resourceShares).where(eq(resourceShares.id, share.id));
  revalidateResources(share.clientId);
}

/**
 * Batch share (TOK-50 / CRM-FIRST §2). Same shape as the form batch: pick handouts once,
 * pick families once, one button. A family who already has an item keeps the share she
 * has — re-sharing would only reset nothing and add a duplicate row to her shelf.
 */
async function shareResourcesWithClients(input: {
  organizationId: string;
  actorUserId: string;
  resourceIds: string[];
  clientIds: string[];
}) {
  const db = getDb();
  const resourceIds = [...new Set(input.resourceIds.filter(Boolean))];
  const clientIds = [...new Set(input.clientIds.filter(Boolean))];
  if (resourceIds.length === 0 || clientIds.length === 0) {
    return { shared: 0, skippedDuplicate: 0, clientIds: [] as string[] };
  }

  const library = await db
    .select({ id: resources.id })
    .from(resources)
    .where(
      and(eq(resources.organizationId, input.organizationId), inArray(resources.id, resourceIds)),
    );
  if (library.length === 0) return { shared: 0, skippedDuplicate: 0, clientIds: [] as string[] };

  const existing = await db
    .select({ resourceId: resourceShares.resourceId, clientId: resourceShares.clientId })
    .from(resourceShares)
    .where(
      and(
        eq(resourceShares.organizationId, input.organizationId),
        inArray(resourceShares.clientId, clientIds),
      ),
    );
  const alreadyShared = new Set(existing.map((row) => `${row.resourceId}:${row.clientId}`));

  const values: Array<typeof resourceShares.$inferInsert> = [];
  let skippedDuplicate = 0;
  for (const clientId of clientIds) {
    for (const resource of library) {
      if (alreadyShared.has(`${resource.id}:${clientId}`)) {
        skippedDuplicate += 1;
        continue;
      }
      values.push({
        id: newId(),
        organizationId: input.organizationId,
        resourceId: resource.id,
        clientId,
      });
    }
  }

  if (values.length > 0) await db.insert(resourceShares).values(values);
  const touched = [...new Set(values.map((row) => row.clientId))];

  if (values.length > 0) {
    // Counts and ids only.
    await writeAudit({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "resource.batch_shared",
      entityType: "resource_share",
      entityId: values[0]!.id,
      metadata: {
        shared: String(values.length),
        families: String(touched.length),
        resources: String(library.length),
        skipped_duplicate: String(skippedDuplicate),
      },
    });
  }

  return { shared: values.length, skippedDuplicate, clientIds: touched };
}

/** "Share a handout" on `/doula/clients/[id]` — the family is the page. */
export async function shareResourcesWithClientAction(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  if (!clientId) redirect("/doula/resources?error=share");
  const { staff, client } = await requireStaffClient(clientId);

  const resourceIds = formData.getAll("resourceIds").map(String);
  if (resourceIds.length === 0) redirect(`/doula/clients/${client.id}?resourcesError=pick`);

  const result = await shareResourcesWithClients({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    resourceIds,
    clientIds: [client.id],
  });

  revalidateResources(client.id);
  if (result.shared === 0) redirect(`/doula/clients/${client.id}?resourcesError=duplicate`);
  redirect(`/doula/clients/${client.id}?resourcesShared=${result.shared}`);
}

/** The library path: N handouts → N families, one button (`/doula/resources`). */
export async function shareResourcesWithFamiliesAction(formData: FormData) {
  const staff = await requireStaff();
  const resourceIds = formData.getAll("resourceIds").map(String);
  const clientIds = formData.getAll("clientIds").map(String);
  if (resourceIds.length === 0 || clientIds.length === 0) redirect("/doula/resources?error=share");

  for (const clientId of clientIds) await requireStaffClient(clientId);

  const result = await shareResourcesWithClients({
    organizationId: staff.organizationId,
    actorUserId: staff.userId,
    resourceIds,
    clientIds,
  });

  for (const clientId of result.clientIds) revalidateResources(clientId);
  revalidateResources();
  if (result.shared === 0) redirect("/doula/resources?error=duplicate");
  redirect(`/doula/resources?created=share&shared=${result.shared}`);
}
