/**
 * One-shot remap of pre-TOK-49 pipeline stage values on an existing database.
 *
 * `db:push` moves columns, not the text inside them, so a deploy onto a database seeded
 * before the stage model expanded would still hold `intro` / `fit` / `contract_complete`.
 * Idempotent — running it against an already-migrated database changes nothing.
 */
import { closeDb } from "../src/db";
import { remapLegacyStages } from "../src/lib/funnel";

async function main() {
  const result = await remapLegacyStages();
  console.log(
    `remapped ${result.stages} pipeline_stages row(s) and ${result.events} pipeline_events row(s)`,
  );
  await closeDb();
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
