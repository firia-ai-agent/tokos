import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { DEMO_PROFILE_SLUGS, demoRateCard } from "../src/lib/demo-rate-cards";
import { parseRatesJson, rateCardColumns } from "../src/lib/provider-rates";

/**
 * Give the seeded provider profiles the structured rates their pages already imply (TOK-74).
 *
 * The seed fix covers a fresh database. The durable demo database is not re-seeded —
 * wiping it would take the founder's own demo data with it — so this is the same change
 * applied in place. It writes only to rows whose rate grid is still empty, which is the
 * TOK-57 gap; a doula who has since saved her own rates is left completely alone, because
 * her card is hers and this script has no business overwriting it.
 *
 * Running it twice is the same as running it once.
 *
 *   npx tsx scripts/ensure-provider-rates.ts
 */

const ENV_FILE = "/home/box/.config/tokos-wildbrook.env";

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
  let written = 0;

  for (const slug of DEMO_PROFILE_SLUGS) {
    const [profile] = await db
      .select()
      .from(schema.providerProfiles)
      .where(eq(schema.providerProfiles.slug, slug))
      .limit(1);

    if (!profile) {
      console.warn(`skip ${slug}: no provider_profiles row on this database`);
      continue;
    }

    // `parseRatesJson` is the same read `/doula/profile` does, so "already has rates" here
    // means exactly what the doula sees in her grid — not merely a non-null column.
    const existing = parseRatesJson(profile.ratesJson);
    if (existing.length > 0) {
      console.log(`ok ${slug}: ${existing.length} rate(s) already published — no writes`);
      continue;
    }

    const columns = rateCardColumns(demoRateCard(slug));
    await db
      .update(schema.providerProfiles)
      .set({ ...columns, updatedAt: new Date() })
      .where(eq(schema.providerProfiles.id, profile.id));
    written += 1;
    console.log(
      `wrote ${slug}: ${columns.ratesJson.length} rate(s) — "${columns.ratesLabel}" · "${columns.serviceArea}"`,
    );
  }

  console.log(written === 0 ? "nothing to do" : `updated ${written} profile(s)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
