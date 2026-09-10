import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A headshot is an identity claim, so it may only ever be read for a named person (TOK-67).
 *
 * The bleed this ticket chases is not a rendering bug — a photo shows the wrong face when
 * something upstream decided the wrong *person*, and by the time `ProviderAvatar` is
 * called the name has already moved with it. So these are structural: every read of
 * `provider_profiles.photo_file_id` is pinned to a user or a profile slug, and every
 * surface that draws a name beside a photo is pinned to resolving both from one person.
 */

function source(...parts: string[]): string {
  return readFileSync(join(process.cwd(), "src", ...parts), "utf8");
}

/** The statement around one mention, which is as much as a source scan can honestly see. */
function windowsAround(text: string, needle: string): string[] {
  const out: string[] = [];
  let index = text.indexOf(needle);
  while (index !== -1) {
    out.push(text.slice(Math.max(0, index - 900), index + 900));
    index = text.indexOf(needle, index + needle.length);
  }
  return out;
}

const PHOTO_READERS = [
  ["lib", "provider-profile.ts"],
  ["lib", "care-team.ts"],
  ["lib", "queries.ts"],
];

describe("a provider photo is only ever read for one named provider (TOK-67)", () => {
  it("scopes every photo_file_id read to a user id", () => {
    for (const parts of PHOTO_READERS) {
      const text = source(...parts);
      const reads = windowsAround(text, "providerProfiles.photoFileId");
      expect(reads.length, parts.join("/")).toBeGreaterThan(0);
      for (const read of reads) {
        expect(read, `${parts.join("/")} must name whose photo it is reading`).toContain(
          "providerProfiles.userId",
        );
      }
    }
  });

  it("scopes the public pages' photo read to the slug that was asked for", () => {
    for (const parts of [
      ["app", "(public)", "p", "[slug]", "page.tsx"],
      ["app", "(public)", "p", "[slug]", "book", "page.tsx"],
    ]) {
      const text = source(...parts);
      expect(text).toContain("eq(providerProfiles.slug, slug)");
      expect(text).toContain("eq(users.id, providerProfiles.userId)");
    }
  });

  it("draws the signed-in staffer's own headshot in the rail, never the practice's", () => {
    const layout = source("app", "(doula)", "doula", "layout.tsx");
    expect(layout).toContain("userId: session.user.id");
    expect(layout).toContain("providerPhotoFileId");
  });

  it("reads the profile on the settings page for the staffer looking at it", () => {
    const profile = source("app", "(doula)", "doula", "profile", "page.tsx");
    expect(profile).toContain("userId: staff.userId");
  });
});

describe("name and face are resolved from one person (TOK-67)", () => {
  /**
   * The portal draws `doula.name` beside `care.photoFileId` — two resolvers, one person.
   * That only holds because the care card is asked for the doula the name came from; pass
   * anything else and the family reads Priya's name over Maya's face.
   */
  it("asks the care card for the doula the portal just named", () => {
    for (const parts of [
      ["app", "(client)", "portal", "page.tsx"],
      ["app", "(client)", "portal", "messages", "page.tsx"],
    ]) {
      const text = source(...parts);
      expect(text, parts.join("/")).toContain("doulaUserId: doula.userId");
      expect(text).toContain("photoFileId={care.photoFileId}");
      expect(text).toContain("name={doula.name}");
    }
  });

  it("pairs the roster card's photo with the same account row as its name", () => {
    const team = source("app", "(doula)", "doula", "team", "page.tsx");
    expect(team).toContain("name={account.name}");
    expect(team).toContain("photoFileId={account.photoFileId}");
  });

  it("keeps the care card blank rather than guessing when nobody is assigned", () => {
    const careTeam = source("lib", "care-team.ts");
    // `doulaUserId` null means no photo read at all — the practice does not lend a face.
    expect(careTeam).toContain("doulaUserId");
    expect(careTeam).toMatch(/doulaUserId\s*\n?\s*\?/);
  });
});
