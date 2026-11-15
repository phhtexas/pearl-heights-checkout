export function loadMigrations(dir?: URL): Array<{ version: string; file: string; checksum: string; statements: string[] }>;
