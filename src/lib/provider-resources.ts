/**
 * Whose handout is it (TOK-70).
 *
 * The bug: the seed wrote one org-wide resource titled **"What Maya does (and does not
 * do)"**, in Maya's first-person voice. NOVA is an agency, so Priya opened
 * `/doula/resources`, found the founder's named handout in *her* library, and could share
 * a document that says "I stay with you" over someone else's name into a family portal.
 * That is the same class of bug as the intro link that fell back to `maya-chen` (TOK-68):
 * a founder-shaped default surviving into a workspace with more than one person in it.
 *
 * Two rules, and the second is what actually fixes it:
 *
 *  1. A named handout's title is **built from the owning provider's name**, never typed.
 *     `providerHandoutTitle` is the only place that sentence exists, so there is no
 *     literal "Maya" anywhere to leak into someone else's row.
 *  2. A resource carries an **owner**. `resources.owner_user_id` set means it is that
 *     doula's own voice and only she sees it in the library; `null` means the practice
 *     wrote it and everyone does. Filtering is `visibleResources`, called by every list.
 *
 * TOK-38/41 intent is kept: the handout is still written in a person's voice and still
 * has a distinct title, so it cannot collide with the comfort checklist in a family's
 * list. It is just that the person is whoever owns it.
 *
 * Pure. The reads live in `@/lib/queries` and `scripts/seed.ts` calls the same helpers.
 */

/** First name only — a handout title with a surname in it reads like a form. */
export function providerFirstName(name: string | null | undefined): string {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  return first;
}

/**
 * The scope-of-practice handout, titled for whoever wrote it. Falls back to the practice
 * when there is no name to use — "What your care team does" is honest; naming a founder
 * who did not write it is not.
 */
export const PROVIDER_HANDOUT_FALLBACK_TITLE = "What your care team does (and does not do)";

export function providerHandoutTitle(name: string | null | undefined): string {
  const first = providerFirstName(name);
  return first ? `What ${first} does (and does not do)` : PROVIDER_HANDOUT_FALLBACK_TITLE;
}

/**
 * The body in that provider's own first person. No name appears in the sentences — the
 * title says who is speaking, and "I" cannot be wrong about whose voice it is.
 */
export function providerHandoutBody(): string {
  return (
    "I stay with you, help you change positions, talk with your partner, and keep the plan " +
    "visible. I do not perform clinical exams and I do not speak for your medical team — " +
    "that stays with your midwife or doctor."
  );
}

export const PROVIDER_HANDOUT_TAGS = ["welcome", "expectations"] as const;

export type OwnedResource = {
  id: string;
  title: string;
  ownerUserId?: string | null;
};

/**
 * The library a given staff user may see: everything the practice owns, plus her own
 * named handouts, and nobody else's. Deliberately *not* role-aware — an owner reading
 * another doula's first-person handout is the same bleed from a different chair, and a
 * founder who wants to see it can look at the family's shelf where it was shared.
 */
export function visibleResources<T extends OwnedResource>(
  library: readonly T[],
  viewerUserId: string,
): T[] {
  return library.filter(
    (resource) => !resource.ownerUserId || resource.ownerUserId === viewerUserId,
  );
}

/** True when this row belongs to one person rather than to the practice. */
export function isPersonalResource(resource: OwnedResource): boolean {
  return Boolean(resource.ownerUserId);
}

/**
 * Would this title show someone else's name to `viewerName`? The guard the test asserts
 * on, and the reason the seed cannot regress: a provider-named title is only ever correct
 * for the provider it was built from.
 */
export function titleNamesSomeoneElse(title: string, ownerName: string | null | undefined): boolean {
  return title !== providerHandoutTitle(ownerName);
}
