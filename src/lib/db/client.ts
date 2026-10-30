import "server-only";
import { neon } from "@neondatabase/serverless";
import { requiredEnv } from "@/lib/env";

export type Row = Record<string, unknown>;

/** The one method the app uses. Each call is a single statement, so it's atomic on its own. */
export type Sql = { query: (text: string, params?: unknown[]) => Promise<Row[]> };

let sql: Sql | null = null;

/** DATABASE_URL is read on first use, not at import: CI builds without it. */
export function getSql(): Sql {
  sql ??= neon(requiredEnv("DATABASE_URL"));
  return sql;
}

/** Tests swap in a fake. Pass null to go back to the real one. */
export function setSql(fake: Sql | null): void {
  sql = fake;
}
