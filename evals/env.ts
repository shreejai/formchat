/**
 * Env the eval runner needs. Checked before any call, because a missing model name otherwise
 * fails every call and gets scored as a 0% model regression at $0 cost.
 */
export const REQUIRED_EVAL_ENV = [
  "OPENAI_API_KEY",
  "OPENAI_MODEL_SMALL",
  "OPENAI_MODEL_LARGE",
  "OPENAI_MODEL_MODERATION",
  "OPENAI_PRICE_SMALL_IN",
  "OPENAI_PRICE_SMALL_OUT",
  "OPENAI_PRICE_LARGE_IN",
  "OPENAI_PRICE_LARGE_OUT",
] as const;

/** Required names that are unset or empty. */
export function missingEnv(
  env: Record<string, string | undefined>,
  names: readonly string[] = REQUIRED_EVAL_ENV,
): string[] {
  return names.filter((name) => !env[name]?.trim());
}
