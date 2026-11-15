import { neon } from "@neondatabase/serverless";

/** Minimal database interface so production (Neon over HTTP) and tests (PGlite) share the same SQL. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs all statements in one transaction (all or nothing); returns each statement's rows. */
  tx(statements: Array<[string, unknown[]]>): Promise<any[][]>;
}

export function neonDb(url: string): Db {
  const sql = neon(url);
  return {
    async query<T>(text: string, params: unknown[] = []) { return (await sql.query(text, params)) as T[]; },
    async tx(statements) { return (await sql.transaction(statements.map(([t, p]) => sql.query(t, p)))) as any[][]; },
  };
}

const g = globalThis as unknown as { __phhDb?: Db };
/** The shared database for this server instance, or null when DATABASE_URL is not set (mock without DB). */
export function getDb(env: NodeJS.ProcessEnv = process.env): Db | null {
  if (!env.DATABASE_URL) return null;
  return (g.__phhDb ??= neonDb(env.DATABASE_URL));
}
