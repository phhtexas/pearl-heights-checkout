// Versioned migrations (ChatGPT notes 82, 85). Applies db/migrations/NNNN_*.sql in order.
//
// Each migration runs as ONE transaction:  pg_advisory_xact_lock  ->  DO block that, while holding the lock,
// checks schema_migrations for this version: absent -> run every statement + record version/checksum;
// present with the same checksum -> do nothing; present with a different checksum -> raise (build fails).
// So two concurrent deploys can both think a migration is pending, but only the first to get the lock applies it;
// the second sees it recorded and skips. Migrations do NOT need to be idempotent for this to be safe.
// Runs before `next build` on Vercel; skipped when DATABASE_URL is not set.
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

export const LOCK_ID = 727274001;
export const CREATE_TABLE = "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, file text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())";

export function loadMigrations(dir = new URL("../db/migrations/", import.meta.url)) {
  return readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort().map((file) => {
    const text = readFileSync(new URL(file, dir), "utf8");
    const statements = text.split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
    return { version: file.slice(0, 4), file, checksum: createHash("sha256").update(text).digest("hex"), statements };
  });
}

/** The guarded body for one migration. Identifiers come from validated file names; SQL is dollar-quoted. */
export function guardedBlock(m) {
  if (!/^\d{4}$/.test(m.version) || !/^[0-9a-f]{64}$/.test(m.checksum)) throw new Error("bad migration metadata");
  for (const s of m.statements) if (s.includes("$mig$")) throw new Error(`${m.file}: contains reserved $mig$`);
  const exec = m.statements.map((s) => `    EXECUTE $mig$${s}$mig$;`).join("\n");
  return `DO $guard$
DECLARE existing text;
BEGIN
  SELECT checksum INTO existing FROM schema_migrations WHERE version = '${m.version}';
  IF existing IS NULL THEN
${exec}
    INSERT INTO schema_migrations (version, file, checksum) VALUES ('${m.version}', '${m.file}', '${m.checksum}');
    RAISE NOTICE 'applied %', '${m.file}';
  ELSIF existing <> '${m.checksum}' THEN
    RAISE EXCEPTION 'migration % changed after it was applied', '${m.file}';
  END IF;
END
$guard$`;
}

/** db = { query(text, params) -> rows, tx(statements: [text, params][]) } (Neon HTTP in prod, PGlite in tests). */
export async function runMigrations(db, migrations = loadMigrations(), log = console.log) {
  await db.query(CREATE_TABLE, []);
  for (const m of migrations) {
    await db.tx([["SELECT pg_advisory_xact_lock($1)", [LOCK_ID]], [guardedBlock(m), []]]);
  }
  const rows = await db.query("SELECT file FROM schema_migrations ORDER BY version", []);
  log(`migrate: applied versions: ${rows.map((r) => r.file).join(", ")}`);
  return rows.map((r) => r.file);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.log("migrate: DATABASE_URL not set, skipping"); return; }
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  const db = {
    query: (t, p) => sql.query(t, p),
    tx: (st) => sql.transaction(st.map(([t, p]) => sql.query(t, p))),
  };
  await runMigrations(db);
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
