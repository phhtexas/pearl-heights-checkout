// Applies db/schema.sql (idempotent). Runs before `next build` on Vercel; skipped when DATABASE_URL is not set.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) { console.log("migrate: DATABASE_URL not set, skipping"); process.exit(0); }
const sql = neon(url);
const text = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const statements = text.split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
for (const s of statements) await sql.query(s);
const tables = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1");
console.log(`migrate: ${statements.length} statements applied; tables: ${tables.map((t) => t.table_name).join(", ")}`);
