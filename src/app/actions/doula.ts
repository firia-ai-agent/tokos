"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { formAssignments, formSubmissions, portalMessages, providerProfiles } from "@/db/schema";
import {
  confirmFit,
  sendContract,
  sendIntro,
  startActiveCare,
  startFit,
} from "@/lib/funnel";
import { newId } from "@/lib/ids";
import { enqueueEmail } from "@/lib/outbox";
import { requireStaff } from "@/lib/tenancy";
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

export async function startFitAction(clientId: string) {
  const staff = await requireStaff();
  await startFit({
    organizationId: staff.organizationId,
    clientId,
    actorUserId: staff.userId,
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
  const staff = await requireStaff();
  const clientId = String(formData.get("clientId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!clientId || !body) return;
  const db = getDb();
  await db.insert(portalMessages).values({
    id: newId(),
    organizationId: staff.organizationId,
    clientId,
    fromUserId: staff.userId,
    direction: "outbound",
    body,
  });
  revalidatePath("/doula");
  revalidatePath("/portal");
}

export async function saveAvailabilityAction(formData: FormData) {
  const staff = await requireStaff();
  const { availability } = await import("@/db/schema");
  const db = getDb();
  await db.delete(availability).where(eq(availability.userId, staff.userId));
  const days = [1, 2, 3, 4, 5, 6, 0];
  for (const weekday of days) {
    if (formData.get(`day-${weekday}`) !== "on") continue;
    await db.insert(availability).values({
      id: newId(),
      organizationId: staff.organizationId,
      userId: staff.userId,
      weekday,
      startMinutes: Number(formData.get(`start-${weekday}`) ?? 10) * 60,
      endMinutes: Number(formData.get(`end-${weekday}`) ?? 16) * 60,
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
  revalidatePath("/doula/profile");
}

export async function coCompleteFormAction(formData: FormData) {
  const staff = await requireStaff();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  if (!assignmentId) return;
  const db = getDb();
  const [assignment] = await db
    .select()
    .from(formAssignments)
    .where(
      and(
        eq(formAssignments.id, assignmentId),
        eq(formAssignments.organizationId, staff.organizationId),
      ),
    )
    .limit(1);
  if (!assignment) return;

  const answers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field-")) {
      answers[key.replace("field-", "")] = String(value);
    }
  }
  await db.insert(formSubmissions).values({
    id: newId(),
    organizationId: staff.organizationId,
    assignmentId,
    submittedByUserId: staff.userId,
    answersJson: answers,
  });
  await db
    .update(formAssignments)
    .set({ status: "complete", updatedAt: new Date() })
    .where(eq(formAssignments.id, assignmentId));
  revalidatePath("/doula");
}

export async function remindFormsAction(clientId: string, email: string, name: string) {
  const staff = await requireStaff();
  await enqueueEmail({
    organizationId: staff.organizationId,
    triggerKey: "form_reminder",
    toEmail: email,
    vars: {
      client_name: name,
      portal_url: `${appUrl()}/portal`,
    },
  });
  void clientId;
}
