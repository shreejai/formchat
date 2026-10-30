import "server-only";

/** Missing configuration. Its message names the variable and is safe to log. */
export class ConfigError extends Error {
  name = "ConfigError";
}

/** Read inside functions, never at import: CI builds without these set. */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ConfigError(`Missing env var ${name}`);
  return value;
}
