import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The upload path with the database and S3 faked out (TOK-63).
 *
 * `photo.test.ts` proves which files are allowed in; this proves a valid doula gets her
 * photo stored even when nobody ever seeded her a profile — the founder's repro, where
 * Priya's upload came back "there is no provider profile to attach a photo to yet".
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const PRIYA = "22222222-2222-4222-8222-222222222224";
const PROFILE_ID = "66666666-6666-4666-8666-666666666668";

/** A four-byte JPEG header is all `sniffImageType` reads. */
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

const fixtures = vi.hoisted(() => ({
  /** Answered in call order — see `provider-profile.test.ts` for why. */
  selects: [] as unknown[][],
  inserts: [] as { table: string; values: Record<string, unknown> }[],
  updates: [] as { table: string; values: Record<string, unknown> }[],
  writeAudit: vi.fn(async () => {}),
}));

vi.mock("@/lib/audit", () => ({ writeAudit: fixtures.writeAudit }));
vi.mock("@/lib/adapters/s3", () => ({
  putObject: vi.fn(async (input: { key: string }) => ({
    provider: "stub" as const,
    bucket: "local-stub",
    key: input.key,
  })),
}));
vi.mock("@/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  type Table = Parameters<typeof getTableName>[0];
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
      insert: (table: Table) => ({
        values: async (values: Record<string, unknown>) => {
          fixtures.inserts.push({ table: getTableName(table), values });
        },
      }),
      update: (table: Table) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            fixtures.updates.push({ table: getTableName(table), values });
          },
        }),
      }),
      delete: () => ({ where: async () => {} }),
    }),
  };
});

const { saveProviderPhoto } = await import("./provider-photo");

const priyaUser = { name: "Priya Raman", email: "priya@novabirthpartners.com" };
const createdProfile = {
  id: PROFILE_ID,
  organizationId: ORG,
  userId: PRIYA,
  slug: "priya-raman",
  headline: "Birth and postpartum support",
  bio: "Priya supports families…",
  photoFileId: null,
  published: true,
};

function photo(bytes = jpegBytes, type = "image/jpeg") {
  return new File([bytes], "headshot.jpg", { type });
}

beforeEach(() => {
  fixtures.selects = [];
  fixtures.inserts = [];
  fixtures.updates = [];
  fixtures.writeAudit.mockClear();
});

describe("saveProviderPhoto with no profile yet (TOK-63)", () => {
  it("creates the profile and attaches the photo instead of returning no_profile", async () => {
    // Lookup finds nothing, the user row supplies the name, no slug is taken, and the
    // lookup after the insert returns the row that was just created.
    fixtures.selects = [[], [priyaUser], [], [createdProfile]];

    const result = await saveProviderPhoto({ organizationId: ORG, userId: PRIYA, file: photo() });

    expect(result).toEqual({ ok: true, fileId: expect.any(String) });
    const profileInsert = fixtures.inserts.find((row) => row.table === "provider_profiles");
    expect(profileInsert?.values).toMatchObject({ userId: PRIYA, slug: "priya-raman" });

    const fileInsert = fixtures.inserts.find((row) => row.table === "file_objects");
    expect(fileInsert?.values).toMatchObject({
      organizationId: ORG,
      contentType: "image/jpeg",
      purpose: "provider_photo",
      sizeBytes: jpegBytes.byteLength,
    });

    // The photo is pointed at the profile that was just created, not at anyone else's.
    const repoint = fixtures.updates.find((row) => row.table === "provider_profiles");
    expect(repoint?.values.photoFileId).toBe(
      (fileInsert?.values as { id: string } | undefined)?.id,
    );
    expect(fixtures.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "provider_profile.photo_updated", entityId: PROFILE_ID }),
    );
  });

  it("attaches to the existing profile when there already is one, creating nothing", async () => {
    fixtures.selects = [[{ ...createdProfile, photoFileId: null }]];

    const result = await saveProviderPhoto({ organizationId: ORG, userId: PRIYA, file: photo() });

    expect(result.ok).toBe(true);
    expect(fixtures.inserts.filter((row) => row.table === "provider_profiles")).toHaveLength(0);
  });

  it("still rejects a file that is not an image, before writing any row", async () => {
    fixtures.selects = [[], [priyaUser], [], [createdProfile]];
    const notAnImage = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "cv.pdf", {
      type: "image/jpeg",
    });

    expect(await saveProviderPhoto({ organizationId: ORG, userId: PRIYA, file: notAnImage })).toEqual(
      { ok: false, code: "unreadable" },
    );
    expect(fixtures.inserts).toHaveLength(0);
  });
});
