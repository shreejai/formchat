import "server-only";

/** Read inside functions, never at import: CI builds without these set. */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}
