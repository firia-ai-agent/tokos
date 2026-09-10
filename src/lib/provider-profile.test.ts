import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TOK-63. Priya is a seeded NOVA doula who was never given a `provider_profiles` row, so
 * her first photo upload came back "there is no provider profile to attach a photo to
 * yet" — a dead end for someone the app had already decided was staff. These assertions
 * are about the row being created on the way through rather than being a precondition.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const PRIYA = "22222222-2222-4222-8222-222222222224";
const MAYA = "22222222-2222-4222-8222-222222222222";

const fixtures = vi.hoisted(() => ({
  /**
   * Selects are answered in call order rather than by reading the `where` clause, so each
   * test spells out what the database says at each step of `ensureProviderProfile`:
   * the profile lookup, the user row, the slugs already taken, then the lookup after insert.
   */
  selects: [] as unknown[][],
  inserts: [] as Record<string, unknown>[],
  /** Lets a test make one insert fail the way a unique index would. */
  failInsert: null as ((values: Record<string, unknown>) => Error | null) | null,
}));

vi.mock("@/db", () => {
  const thenable = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["where", "limit", "orderBy"]) chain[method] = () => chain;
    chain.then = (onFulfilled: (value: unknown) => unknown, onRejected?: () => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected);
    return chain;
  };
  return {
    getDb: () => ({
      select: () => ({ from: () => thenable(fixtures.selects.shift() ?? []) }),
      insert: () => ({
        values: async (values: Record<string, unknown>) => {
          const failure = fixtures.failInsert?.(values) ?? null;
          if (failure) throw failure;
          fixtures.inserts.push(values);
        },
      }),
    }),
  };
});

const {
  PROVIDER_PROFILE_PLACEHOLDER_HEADLINE,
  ensureProviderProfile,
  placeholderBio,
  providerSlugBase,
  providerSlugCandidates,
} = await import("./provider-profile");

const priyaRow = { name: "Priya Raman", email: "priya@novabirthpartners.com" };
const existingProfile = {
  id: "66666666-6666-4666-8666-666666666668",
  organizationId: ORG,
  userId: PRIYA,
  slug: "priya-raman",
  headline: "Overnight and postpartum care",
  bio: "…",
  photoFileId: null,
  published: true,
};

beforeEach(() => {
  fixtures.selects = [];
  fixtures.inserts = [];
  fixtures.failInsert = null;
});

describe("provider slugs", () => {
  it("reads as the doula's name, which is what goes on a card", () => {
    expect(providerSlugBase({ name: "Priya Raman" })).toBe("priya-raman");
    expect(providerSlugBase({ name: "  Maya   Chen  " })).toBe("maya-chen");
  });

  it("folds accents instead of dropping the letters they sit on", () => {
    expect(providerSlugBase({ name: "Renée Dubois" })).toBe("renee-dubois");
  });

  it("falls back to the email local-part, then to a word that is at least a URL", () => {
    expect(providerSlugBase({ name: "", email: "sam.ortega@cedarbirth.co" })).toBe("sam-ortega");
    expect(providerSlugBase({ name: "🙂", email: "" })).toBe("doula");
  });

  it("offers wider candidates so a shared name is not a failed upload", () => {
    const candidates = providerSlugCandidates({ name: "Priya Raman", userId: PRIYA });
    expect(candidates[0]).toBe("priya-raman");
    expect(new Set(candidates).size).toBe(candidates.length);
    for (const candidate of candidates.slice(1)) expect(candidate).toMatch(/^priya-raman-/);
    // The last one is built from the whole user id, so it can only collide with a row for
    // this same user — and that row would already have been returned by the lookup.
    expect(candidates[candidates.length - 1]).toContain(PRIYA.replace(/-/g, ""));
  });

  it("writes a placeholder bio that does not guess anyone's pronouns", () => {
    const bio = placeholderBio("Priya Raman");
    expect(bio).toContain("Priya");
    expect(bio).not.toMatch(/\b(she|her|he|him|his|hers)\b/i);
    expect(placeholderBio(null)).toContain("This doula");
  });
});

describe("ensureProviderProfile (TOK-63)", () => {
  it("returns the existing profile without writing anything", async () => {
    fixtures.selects = [[existingProfile]];
    const profile = await ensureProviderProfile({ organizationId: ORG, userId: PRIYA });

    expect(profile).toEqual(existingProfile);
    expect(fixtures.inserts).toHaveLength(0);
  });

  it("creates a published profile for a doula who never had one", async () => {
    fixtures.selects = [[], [priyaRow], [], [existingProfile]];
    const profile = await ensureProviderProfile({ organizationId: ORG, userId: PRIYA });

    expect(fixtures.inserts).toHaveLength(1);
    const written = fixtures.inserts[0];
    expect(written).toMatchObject({
      organizationId: ORG,
      userId: PRIYA,
      slug: "priya-raman",
      headline: PROVIDER_PROFILE_PLACEHOLDER_HEADLINE,
      // Published, so `/p/[slug]` works the moment she saves — same as the seeded founder.
      published: true,
    });
    expect(String(written.bio)).toContain("Priya");
    expect(written.id).toEqual(expect.any(String));
    expect(profile).toEqual(existingProfile);
  });

  it("steps past a slug another doula already holds", async () => {
    fixtures.selects = [[], [priyaRow], [{ slug: "priya-raman" }], [existingProfile]];
    await ensureProviderProfile({ organizationId: ORG, userId: PRIYA });

    const slug = String(fixtures.inserts[0].slug);
    expect(slug).not.toBe("priya-raman");
    expect(slug).toMatch(/^priya-raman-/);
  });

  it("re-reads the winner when two writes race, rather than failing the upload", async () => {
    const winner = { ...existingProfile, slug: "priya-raman" };
    fixtures.failInsert = () => new Error('duplicate key value violates unique constraint');
    fixtures.selects = [[], [priyaRow], [], [winner]];

    const profile = await ensureProviderProfile({ organizationId: ORG, userId: PRIYA });
    expect(profile).toEqual(winner);
    expect(fixtures.inserts).toHaveLength(0);
  });

  it("names the user it could not place when every candidate is taken", async () => {
    const taken = providerSlugCandidates({ name: "Maya Chen", userId: MAYA }).map((slug) => ({
      slug,
    }));
    fixtures.selects = [[], [{ name: "Maya Chen", email: "maya@novabirthpartners.com" }], taken];

    await expect(ensureProviderProfile({ organizationId: ORG, userId: MAYA })).rejects.toThrow(MAYA);
  });
});
