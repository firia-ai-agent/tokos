import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "../src/db/schema";
import {
  PROVIDER_HANDOUT_TAGS,
  providerFirstName,
  providerHandoutBody,
  providerHandoutTitle,
} from "../src/lib/provider-resources";

/**
 * Stop one doula's named handout from sitting in another doula's library (TOK-70).
 *
 * The seed used to write a single org-wide resource titled "What Maya does (and does not
 * do)", in the founder's first person. NOVA has two doulas, so Priya opened
 * `/doula/resources` and found it there — hers to share into a family portal over someone
 * else's name.
 *
 * The seed is fixed, but the durable demo database is not re-seeded (that would take the
 * founder's own demo data with it), so this applies the same change in place:
 *
 *  1. Any unowned resource whose title matches a roster member's named handout is given
 *     to that member — the title already said whose it was, now the row does too.
 *  2. Every doula on the roster who has no named handout gets her own, in her voice.
 *
 * Idempotent: it writes only what is missing, so running it twice is running it once.
 *
 *   npx tsx scripts/ensure-provider-resources.ts
 */

const ENV_FILE = "/home/box/.config/tokos-wildbrook.env";

/** Roles that write handouts in their own voice. A family login never owns a resource. */
const PROVIDER_ROLES = ["owner", "admin", "doula"];

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

/** A stable uuid for a provider's handout, derived from her user id. */
function handoutId(userId: string): string {
  return `${userId.slice(0, 8)}-70a0-4700-8700-${userId.slice(-12)}`;
}

async function main() {
  const db = drizzle(neon(readEnvVar("DATABASE_URL")), { schema });

  const providers = await db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      role: schema.memberships.role,
      organizationId: schema.memberships.organizationId,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId));

  const roster = providers.filter((row) => PROVIDER_ROLES.includes(row.role));
  console.log(`roster: ${roster.length} provider membership(s)`);

  let claimed = 0;
  let created = 0;

  for (const provider of roster) {
    const title = providerHandoutTitle(provider.name);
    if (!providerFirstName(provider.name)) {
      console.warn(`skipping ${provider.userId}: no name to title a handout with`);
      continue;
    }

    // 1. An existing org-wide row that already carries her name becomes hers. Scoped to
    //    `owner_user_id IS NULL` so a row already claimed is never reassigned.
    const orphans = await db
      .update(schema.resources)
      .set({ ownerUserId: provider.userId, body: providerHandoutBody(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.resources.organizationId, provider.organizationId),
          eq(schema.resources.title, title),
          isNull(schema.resources.ownerUserId),
        ),
      )
      .returning({ id: schema.resources.id });
    if (orphans.length > 0) {
      claimed += orphans.length;
      console.log(`claimed for ${provider.name}: ${title} (${orphans.length} row)`);
      continue;
    }

    // 2. Already has one of her own? Then there is nothing to do for her.
    const [mine] = await db
      .select({ id: schema.resources.id })
      .from(schema.resources)
      .where(
        and(
          eq(schema.resources.organizationId, provider.organizationId),
          eq(schema.resources.ownerUserId, provider.userId),
          eq(schema.resources.title, title),
        ),
      )
      .limit(1);
    if (mine) continue;

    await db.insert(schema.resources).values({
      id: handoutId(provider.userId),
      organizationId: provider.organizationId,
      ownerUserId: provider.userId,
      title,
      kind: "handout",
      body: providerHandoutBody(),
      tags: [...PROVIDER_HANDOUT_TAGS],
    });
    created += 1;
    console.log(`wrote for ${provider.name}: ${title}`);
  }

  // Anything still unowned and still shaped like a personal handout would be a bleed we
  // did not catch — say so loudly rather than leaving it for a founder to find.
  const leftover = await db
    .select({ id: schema.resources.id, title: schema.resources.title })
    .from(schema.resources)
    .where(isNull(schema.resources.ownerUserId));
  const suspicious = leftover.filter((row) => / does \(and does not do\)$/.test(row.title));
  for (const row of suspicious) {
    console.warn(`WARNING: unowned personal-looking handout remains: "${row.title}" (${row.id})`);
  }

  console.log(`done: ${claimed} claimed, ${created} written, ${suspicious.length} still unowned`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
