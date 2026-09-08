"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { providerProfiles } from "@/db/schema";
import { checkSlot } from "@/lib/calendar";
import { createLeadFromBooking } from "@/lib/funnel";

export async function publicBookAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const edd = String(formData.get("edd") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const [startRaw, endRaw] = slot.split("|");
  const startsAt = new Date(startRaw ?? "");
  const endsAt = new Date(endRaw ?? "");
  if (!slug || !name || !email || Number.isNaN(startsAt.getTime())) {
    redirect(`/p/${slug}/book?error=missing`);
  }

  const db = getDb();
  const [profile] = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.slug, slug))
    .limit(1);
  if (!profile) redirect("/");

  // Re-derive the window from the Tokos calendar; the posted radio value is only a hint.
  const check = await checkSlot({
    organizationId: profile.organizationId,
    userId: profile.userId,
    startsAt,
    endsAt,
  });
  if (!check.ok) {
    redirect(`/p/${slug}/book?error=${check.reason}`);
  }

  await createLeadFromBooking({
    organizationId: profile.organizationId,
    assigneeUserId: profile.userId,
    name,
    email,
    phone,
    edd: edd || undefined,
    startsAt,
    endsAt,
  });

  redirect(`/p/${slug}/booked`);
}
