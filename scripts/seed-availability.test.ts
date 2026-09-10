import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A published provider page is a promise the calendar has to keep (TOK-71).
 *
 * `/p/<slug>/book` renders whatever `listOpenSlots` returns for that profile's user, and
 * a doula with no `availability` rows gets a page that answers 200 and then says "No open
 * windows this fortnight" — the failure looks like working software. The seed grew a
 * second NOVA doula without growing her windows, so this pins the pair: every NOVA doula
 * the seed publishes a profile for is also a doula the seed opens windows for.
 */
const seed = readFileSync(join(process.cwd(), "scripts", "seed.ts"), "utf8");

/** The user ids the seed hands weekday booking windows to. */
function usersWithWindows(): string[] {
  return [...seed.matchAll(/weekdayWindows\(\s*([A-Z_]+)\s*,/g)].map((m) => m[1]);
}

/** The user id constants behind each published NOVA provider profile, by slug. */
function novaProfileUsers(): Map<string, string> {
  const profiles = new Map<string, string>();
  for (const match of seed.matchAll(
    /organizationId: ORG_ID,\s*\n\s*userId: ([A-Z_]+),\s*\n\s*slug: "([^"]+)"/g,
  )) {
    profiles.set(match[2], match[1]);
  }
  return profiles;
}

describe("seeded booking availability", () => {
  it("opens windows for both NOVA doulas, not just the first", () => {
    expect(usersWithWindows()).toEqual(
      expect.arrayContaining(["DOULA_ID", "PRIYA_USER_ID"]),
    );
  });

  it("gives every published NOVA provider page a calendar behind it", () => {
    const profiles = novaProfileUsers();
    // The fixture itself must stay meaningful — two doulas, or this asserts nothing.
    expect(profiles.size).toBeGreaterThanOrEqual(2);
    expect([...profiles.keys()]).toContain("priya-raman");

    const withWindows = new Set(usersWithWindows());
    for (const [slug, userId] of profiles) {
      expect(withWindows, `/p/${slug}/book has no seeded availability`).toContain(userId);
    }
  });
});
