import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzlePg<typeof schema>>;

let _db: Db | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

function isNeonUrl(url: string) {
  return (
    process.env.USE_NEON_HTTP === "1" ||
    url.includes("neon.tech") ||
    url.includes(".neon.")
  );
}

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  if (isNeonUrl(url)) {
    const sql = neon(url);
    return drizzleNeon(sql, { schema }) as unknown as Db;
  }

  _sql = postgres(url, { max: 5 });
  return drizzlePg(_sql, { schema });
}

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export async function closeDb() {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
  }
  _db = null;
}

export type Database = ReturnType<typeof getDb>;
