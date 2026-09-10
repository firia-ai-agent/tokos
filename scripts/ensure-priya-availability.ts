import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

/**
 * Give Priya the open booking windows her public page already promises (TOK-71).
 *
 * The seed fix covers a fresh database, but the durable demo database is not re-seeded —
 * wiping it would take the founder's own demo data with it. This script is the same
 * change applied in place: it adds only the weekday rows that are missing and leaves
 * every existing row alone, so running it twice is the same as running it once.
 *
 *   npx tsx scripts/ensure-priya-availability.ts
 */

const ENV_FILE = "/home/box/.config/tokos-wildbrook.env";
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const PRIYA_USER_ID = "22222222-2222-4222-8222-222222222224";
const PRIYA_SLUG = "priya-raman";
const WEEKDAYS = [1, 2, 3, 4, 5];
const START_MINUTES = 10 * 60;
const END_MINUTES = 16 * 60;
const TIMEZONE = "America/New_York";

/**
 * Read one variable out of the env file without rewriting it. The file holds the only
 * copy of several credentials, so it is opened read-only and matched, never truncated.
 */
function readEnvVar(name: string): string {
  const text = readFileSync(ENV_FILE, "utf8");
  const match = text.match(
    new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*"?([^"\\n]+)"?\\s*$`, "m"),
  );
  if (!match) throw new Error(`${name} not found in ${ENV_FILE}`);
  return match[1].trim();
}

async function main() {
  const db = drizzle(neon(readEnvVar("DATABASE_URL")), { schema });

  const [profile] = await db
    .select()
    .from(schema.providerProfiles)
    .where(eq(schema.providerProfiles.slug, PRIYA_SLUG))
    .limit(1);
  if (!profile) {
    throw new Error(
      `no provider_profiles row for slug ${PRIYA_SLUG} — /p/${PRIYA_SLUG}/book would 404`,
    );
  }
  console.log(
    `profile ok: slug=${profile.slug} userId=${profile.userId} published=${profile.published}`,
  );
  if (!profile.published) {
    console.warn(`warning: ${PRIYA_SLUG} is not published`);
  }
  if (profile.userId !== PRIYA_USER_ID) {
    throw new Error(
      `profile ${PRIYA_SLUG} points at ${profile.userId}, expected ${PRIYA_USER_ID}`,
    );
  }
  if (profile.organizationId !== ORG_ID) {
    throw new Error(
      `profile ${PRIYA_SLUG} is in org ${profile.organizationId}, expected ${ORG_ID}`,
    );
  }

  // Slots are read by (organization, user, weekday), so an existing row for a weekday is
  // already doing the job — only the gaps get written.
  const existing = await db
    .select({ weekday: schema.availability.weekday })
    .from(schema.availability)
    .where(
      and(
        eq(schema.availability.organizationId, profile.organizationId),
        eq(schema.availability.userId, profile.userId),
      ),
    );
  const have = new Set(existing.map((row) => row.weekday));
  const missing = WEEKDAYS.filter((weekday) => !have.has(weekday));

  if (missing.length === 0) {
    console.log(`availability ok: weekdays ${[...have].sort().join(",")} already open — no writes`);
    return;
  }

  await db.insert(schema.availability).values(
    missing.map((weekday) => ({
      // Same ids the seed writes, so a re-seeded database and this one agree.
      id: `bbbbbbc${WEEKDAYS.indexOf(weekday)}-bbbb-4bbb-8bbb-bbbbbbbbbbc${WEEKDAYS.indexOf(weekday)}`,
      organizationId: profile.organizationId,
      userId: profile.userId,
      weekday,
      startMinutes: START_MINUTES,
      endMinutes: END_MINUTES,
      timezone: TIMEZONE,
    })),
  );
  console.log(
    `inserted weekdays ${missing.join(",")} (${START_MINUTES / 60}:00–${END_MINUTES / 60}:00 ${TIMEZONE})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
