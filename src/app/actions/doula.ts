"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { portalMessages, providerProfiles } from "@/db/schema";
import {
  confirmFit,
  logClientContact,
  sendContract,
  sendIntro,
  startActiveCare,
} from "@/lib/funnel";
import { parseAvailabilityWindow } from "@/lib/calendar";
import { newId } from "@/lib/ids";
import { enqueueEmail } from "@/lib/outbox";
import { requireStaff, requireStaffClient } from "@/lib/tenancy";
import { clearProviderPhoto, saveProviderPhoto } from "@/lib/provider-photo";
import type { PhotoErrorCode } from "@/lib/photo";
import { appUrl } from "@/lib/env";

export async function sendIntroAction(clientId: string) {
  const staff = await requireStaff();
  const db = getDb();
  const [profile] = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, staff.userId))
    .limit(1);
  await sendIntro({
    organizationId: staff.organizationId,
    clientId,
    actorUserId: staff.userId,
    profileUrl: `${appUrl()}/p/${profile?.slug ?? "maya-chen"}`,
  });
  revalidatePath("/doula");
}

export async function confirmFitAction(clientId: string) {
  const staff = await requireStaff();
  await confirmFit({
    organizationId: staff.organizationId,
    clientId,
    actorUserId: staff.userId,
  });
  revalidatePath("/doula");
}

export async function sendContractAction(clientId: string) {
  const staff = await requireStaff();
  await sendContract({
    organizationId: staff.organizationId,
    clientId,
    actorUserId: staff.userId,
  });
  revalidatePath("/doula");
  revalidatePath("/portal");
}

export async function startCareAction(clientId: string) {
  const staff = await requireStaff();
  await startActiveCare({
    organizationId: staff.organizationId,
    clientId,
    actorUserId: staff.userId,
  });
  revalidatePath("/doula");
}

export async function sendClientMessageAction(formData: FormData) {
  const clientId = String(formData.get("clientId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!clientId || !body) return;
  const { staff, client } = await requireStaffClient(clientId);
  const db = getDb();
  await db.insert(portalMessages).values({
    id: newId(),
    organizationId: staff.organizationId,
    clientId: client.id,
    fromUserId: staff.userId,
    direction: "outbound",
    body,
  });
  // Writing to a family is contact: Last Contact moves with the thread (TOK-49).
  await logClientContact({
    organizationId: staff.organizationId,
    clientId: client.id,
    actorUserId: staff.userId,
  });
  // Both sides of the thread, plus the family's Home checklist, which counts this as
  // unread until they open `/portal/messages`.
  revalidatePath("/doula");
  revalidatePath("/doula/messages");
  revalidatePath(`/doula/clients/${client.id}`);
  revalidatePath("/portal");
  revalidatePath("/portal/messages");
}

/**
 * Opening a family's record marks what they wrote as read, the mirror of the client side.
 * `requireStaffClient` re-checks the client belongs to this org before anything is
 * stamped, so a posted id from another tenant updates nothing.
 */
export async function markClientMessagesReadAction(clientId: string) {
  if (!clientId) return;
  const { staff, client } = await requireStaffClient(clientId);
  const db = getDb();
  await db
    .update(portalMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(portalMessages.organizationId, staff.organizationId),
        eq(portalMessages.clientId, client.id),
        eq(portalMessages.direction, "inbound"),
        isNull(portalMessages.readAt),
      ),
    );
  revalidatePath("/doula/messages");
  revalidatePath(`/doula/clients/${client.id}`);
}

export async function saveAvailabilityAction(formData: FormData) {
  const staff = await requireStaff();
  const { availability } = await import("@/db/schema");
  const db = getDb();
  await db
    .delete(availability)
    .where(
      and(
        eq(availability.userId, staff.userId),
        eq(availability.organizationId, staff.organizationId),
      ),
    );
  const days = [1, 2, 3, 4, 5, 6, 0];
  for (const weekday of days) {
    if (formData.get(`day-${weekday}`) !== "on") continue;
    // The form now posts minutes from half-hour selects (TOK-33 C8). A window that does
    // not parse is dropped rather than stored inverted — `expandAvailabilitySlots` would
    // silently emit nothing for it, and a doula would never learn why.
    const window = parseAvailabilityWindow(
      formData.get(`start-${weekday}`),
      formData.get(`end-${weekday}`),
    );
    if (!window) continue;
    await db.insert(availability).values({
      id: newId(),
      organizationId: staff.organizationId,
      userId: staff.userId,
      weekday,
      startMinutes: window.startMinutes,
      endMinutes: window.endMinutes,
    });
  }
  revalidatePath("/doula/calendar");
}

export async function saveProfileAction(formData: FormData) {
  const staff = await requireStaff();
  const db = getDb();
  await db
    .update(providerProfiles)
    .set({
      headline: String(formData.get("headline") ?? ""),
      bio: String(formData.get("bio") ?? ""),
      serviceArea: String(formData.get("serviceArea") ?? ""),
      ratesLabel: String(formData.get("ratesLabel") ?? ""),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(providerProfiles.userId, staff.userId),
        eq(providerProfiles.organizationId, staff.organizationId),
      ),
    );

  // The photo rides along on the same form, but an untouched file input still submits an
  // empty File, so only a non-empty pick counts as an upload.
  const photo = formData.get("photo");
  let photoError: PhotoErrorCode | null = null;
  if (photo instanceof File && photo.size > 0) {
    const result = await saveProviderPhoto({
      organizationId: staff.organizationId,
      userId: staff.userId,
      file: photo,
    });
    if (!result.ok) photoError = result.code;
  }

  // The public profile pages are force-dynamic, so they pick the photo up on next request.
  revalidatePath("/doula/profile");
  if (photoError) redirect(`/doula/profile?photoError=${photoError}`);
}

export async function removeProfilePhotoAction() {
  const staff = await requireStaff();
  await clearProviderPhoto({ organizationId: staff.organizationId, userId: staff.userId });
  // The public profile pages are force-dynamic, so they pick the photo up on next request.
  revalidatePath("/doula/profile");
}

/**
 * Server actions are reachable by direct POST, so the recipient never comes from the caller:
 * the client must belong to the staff org, and the address/name are read from that row.
 */
export async function remindFormsAction(clientId: string) {
  if (!clientId) return;
  const { staff, client } = await requireStaffClient(clientId);
  await enqueueEmail({
    organizationId: staff.organizationId,
    triggerKey: "form_reminder",
    toEmail: client.email,
    vars: {
      client_name: client.preferredName ?? client.displayName,
      portal_url: `${appUrl()}/portal`,
    },
  });
  revalidatePath(`/doula/clients/${client.id}`);
}
