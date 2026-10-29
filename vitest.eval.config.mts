import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

/** .env then .env.local, like Next. Real environment variables win. */
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const file of [".env", ".env.local"]) {
    if (existsSync(file)) Object.assign(env, parseEnv(readFileSync(file, "utf8")));
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && value !== "") env[key] = value;
  }
  return env;
}

/** `npm run eval`: real API calls. Costs money; run deliberately. */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    env: loadEnv(),
    testTimeout: 300_000,
  },
});
