"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
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
