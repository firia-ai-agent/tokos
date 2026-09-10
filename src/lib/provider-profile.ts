import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { providerProfiles, users } from "@/db/schema";
import { newId } from "@/lib/ids";

/**
 * The provider profile a doula edits at `/doula/profile` and families read at `/p/[slug]`.
 *
 * Only the founder's own profile was ever seeded, so a second doula — Priya on NOVA — hit
 * "there is no provider profile to attach a photo to yet" on her first upload (TOK-63). A
 * staff user who can reach the form is by definition entitled to a profile, so the row is
 * created on the first write instead of being a precondition for it.
 */

export type ProviderProfileRow = typeof providerProfiles.$inferSelect;

/** Placeholder copy for a row nobody has filled in yet — a starting point, not a bio. */
export const PROVIDER_PROFILE_PLACEHOLDER_HEADLINE = "Birth and postpartum support";

/** No pronouns: the row is created from a name, which says nothing about how to refer to someone. */
export function placeholderBio(name: string | null | undefined) {
  const first = (name ?? "").trim().split(/\s+/)[0];
  const who = first || "This doula";
  return `${who} supports families through pregnancy, birth, and the first weeks home. More about this practice is coming soon.`;
}

/**
 * The public half of the URL, so it is built the same way a person would type it: letters,
 * numbers, and single hyphens. Accents are folded rather than dropped so "Renée" stays
 * "renee" instead of "ren-e".
 */
export function providerSlugBase(input: { name?: string | null; email?: string | null }) {
  const fromName = slugify(input.name ?? "");
  if (fromName) return fromName;
  const fromEmail = slugify((input.email ?? "").split("@")[0]);
  return fromEmail || "doula";
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/**
 * Slugs are unique across the table, so two doulas named Sam Ortega cannot both be
 * `sam-ortega`. The list widens from the readable form to one built out of the user id,
 * which can only collide with a row for that same user — and that row would have been
 * found by the lookup before we ever got here.
 */
export function providerSlugCandidates(input: {
  name?: string | null;
  email?: string | null;
  userId: string;
}) {
  const base = providerSlugBase(input);
  const fragment = input.userId.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const candidates = [
    base,
    `${base}-${fragment.slice(0, 4)}`,
    `${base}-${fragment.slice(0, 8)}`,
    `${base}-${fragment}`,
  ];
  return [...new Set(candidates.filter(Boolean))];
}

export async function findProviderProfile(input: { organizationId: string; userId: string }) {
  const db = getDb();
  const [profile] = await db
    .select()
    .from(providerProfiles)
    .where(
      and(
        eq(providerProfiles.userId, input.userId),
        eq(providerProfiles.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  return profile ?? null;
}

/**
 * Returns this staff user's profile, creating a minimal published one if they do not have
 * it yet. Callers must have already proven the actor is staff in `organizationId` — this
 * writes a row for whoever it is handed.
 */
export async function ensureProviderProfile(input: {
  organizationId: string;
  userId: string;
}): Promise<ProviderProfileRow> {
  const existing = await findProviderProfile(input);
  if (existing) return existing;

  const db = getDb();
  const [user] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  const candidates = providerSlugCandidates({
    name: user?.name,
    email: user?.email,
    userId: input.userId,
  });
  const taken = new Set(
    (
      await db
        .select({ slug: providerProfiles.slug })
        .from(providerProfiles)
        .where(inArray(providerProfiles.slug, candidates))
    ).map((row) => row.slug),
  );

  for (const slug of candidates) {
    if (taken.has(slug)) continue;
    try {
      await db.insert(providerProfiles).values({
        id: newId(),
        organizationId: input.organizationId,
        userId: input.userId,
        slug,
        headline: PROVIDER_PROFILE_PLACEHOLDER_HEADLINE,
        bio: placeholderBio(user?.name),
        published: true,
      });
    } catch (error) {
      // Two writes racing on the same doula: whoever lost re-reads the winner's row rather
      // than reporting there is no profile. A slug someone else took just tries the next one.
      const raced = await findProviderProfile(input);
      if (raced) return raced;
      if (slug === candidates[candidates.length - 1]) throw error;
      continue;
    }
    const created = await findProviderProfile(input);
    if (created) return created;
  }

  throw new Error(`could not allocate a provider profile slug for user ${input.userId}`);
}
