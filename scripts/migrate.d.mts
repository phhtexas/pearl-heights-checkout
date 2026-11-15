export type Migration = { version: string; file: string; checksum: string; statements: string[] };
export const LOCK_ID: number;
export const CREATE_TABLE: string;
export function loadMigrations(dir?: URL): Migration[];
export function guardedBlock(m: Migration): string;
export function runMigrations(db: { query(t: string, p: unknown[]): Promise<any[]>; tx(st: Array<[string, unknown[]]>): Promise<unknown> }, migrations?: Migration[], log?: (s: string) => void): Promise<string[]>;
