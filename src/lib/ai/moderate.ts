import "server-only";
import { getOpenAI } from "./client";

export type ModerationResult = { ok: true; flagged: boolean } | { ok: false };

/**
 * OpenAI moderation for text that will be public. It's free, so it isn't counted against the
 * token cap. Callers treat { ok: false } as "couldn't check" and don't publish.
 */
export async function moderate(text: string): Promise<ModerationResult> {
  try {
    const model = process.env.OPENAI_MODEL_MODERATION;
    if (!model) throw new Error("Missing env var OPENAI_MODEL_MODERATION");
    const response = await getOpenAI().moderations.create({ model, input: text });
    return { ok: true, flagged: response.results.some((r) => r.flagged) };
  } catch (error) {
    console.info(
      JSON.stringify({
        event: "moderation_error",
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return { ok: false };
  }
}
