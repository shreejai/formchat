import type OpenAI from "openai";
import { vi } from "vitest";

/** Env for tests. Dummy values; nothing reaches the network because the client is faked. */
export function stubAiEnv(): void {
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("OPENAI_MODEL_SMALL", "small-test");
  vi.stubEnv("OPENAI_MODEL_LARGE", "large-test");
  vi.stubEnv("OPENAI_MODEL_MODERATION", "moderation-test");
  vi.stubEnv("OPENAI_PRICE_SMALL_IN", "0.5");
  vi.stubEnv("OPENAI_PRICE_SMALL_OUT", "2");
  vi.stubEnv("OPENAI_PRICE_LARGE_IN", "5");
  vi.stubEnv("OPENAI_PRICE_LARGE_OUT", "20");
  vi.stubEnv("OPENAI_REASONING_EFFORT", "");
  vi.stubEnv("AI_MAX_TOKENS_PER_CONVERSATION", "6000");
}

export type FakeResponse = {
  output_text: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    output_tokens_details?: { reasoning_tokens: number };
  };
};

/** A JSON response with small default usage. */
export function jsonResponse(data: unknown, tokens = { input: 100, output: 20, reasoning: 0 }) {
  return {
    output_text: JSON.stringify(data),
    usage: {
      input_tokens: tokens.input,
      output_tokens: tokens.output,
      output_tokens_details: { reasoning_tokens: tokens.reasoning },
    },
  } satisfies FakeResponse;
}

export function fakeOpenAI() {
  const responsesCreate = vi.fn<(body: Record<string, unknown>) => Promise<FakeResponse>>();
  const moderationsCreate = vi.fn<
    (body: Record<string, unknown>) => Promise<{ results: { flagged: boolean }[] }>
  >();
  const client = {
    responses: { create: responsesCreate },
    moderations: { create: moderationsCreate },
  } as unknown as OpenAI;
  return { client, responsesCreate, moderationsCreate };
}
