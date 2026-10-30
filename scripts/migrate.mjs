// Applies db/migrations/*.sql in name order, once each, recording them in schema_migrations.
// Usage: DATABASE_URL=postgres://… npm run db:migrate
import { readdir, readFile } from "node:fs/promises";
import { Pool } from "@neondatabase/serverless";

const dir = new URL("../db/migrations/", import.meta.url);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing env var DATABASE_URL");
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await client.query("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(new URL(file, dir), "utf8");
      // One transaction per file, so a failed migration leaves nothing half-applied.
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`applied ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    console.log("migrations up to date");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
