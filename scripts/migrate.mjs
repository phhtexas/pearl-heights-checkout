// Versioned migrations (ChatGPT note 82). Applies db/migrations/NNNN_*.sql in order, each in one transaction that
// first takes a Postgres advisory lock, so two concurrent deploys cannot apply the same migration twice.
// Applied versions and checksums are recorded in schema_migrations; a changed, already-applied file fails the build.
// Runs before `next build` on Vercel; skipped when DATABASE_URL is not set.
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const LOCK_ID = 727274001;
export function loadMigrations(dir = new URL("../db/migrations/", import.meta.url)) {
  return readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort().map((file) => {
    const text = readFileSync(new URL(file, dir), "utf8");
    const statements = text.split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
    return { version: file.slice(0, 4), file, checksum: createHash("sha256").update(text).digest("hex"), statements };
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.log("migrate: DATABASE_URL not set, skipping"); return; }
  const sql = neon(url);
  await sql.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, file text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Map((await sql.query("SELECT version, checksum FROM schema_migrations")).map((r) => [r.version, r.checksum]));
  for (const m of loadMigrations()) {
    if (applied.has(m.version)) {
      if (applied.get(m.version) !== m.checksum) throw new Error(`migrate: ${m.file} changed after it was applied`);
      continue;
    }
    await sql.transaction([
      sql.query("SELECT pg_advisory_xact_lock($1)", [LOCK_ID]),
      ...m.statements.map((s) => sql.query(s)),
      sql.query("INSERT INTO schema_migrations (version, file, checksum) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING", [m.version, m.file, m.checksum]),
    ]);
    console.log(`migrate: applied ${m.file}`);
  }
  const rows = await sql.query("SELECT version, file, applied_at FROM schema_migrations ORDER BY version");
  console.log("migrate: applied versions:", rows.map((r) => r.file).join(", "));
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
