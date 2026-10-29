import "server-only";
import { createHash } from "node:crypto";
import OpenAI, { APIConnectionTimeoutError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ReasoningEffort } from "openai/resources/shared";
import type { z } from "zod";

/*
 * The one wrapper for every OpenAI call. Nothing here reads env vars or builds the client at
 * import time, so `next build` works without secrets.
 */

export type Tier = "small" | "large";

export type Usage = {
  model: string;
  inputTokens: number;
  /** Includes reasoning tokens, as OpenAI bills them. */
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number;
};

export type AiFailure = "could_not_understand" | "budget_exceeded" | "timeout" | "error";

export type CallResult<T> =
  | { ok: true; data: T; usage: Usage }
  | { ok: false; reason: AiFailure; usage: Usage | null };

export const DEFAULT_MAX_TOKENS_PER_CONVERSATION = 6000;
const DEFAULT_TIMEOUT_MS = 15_000;
/** Rough chars-per-token for the pre-call budget estimate. Low on purpose, to over-estimate. */
const CHARS_PER_TOKEN = 3;

/** Missing configuration. Its message names the variable and is safe to log. */
class ConfigError extends Error {
  name = "ConfigError";
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ConfigError(`Missing env var ${name}`);
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function tierConfig(tier: Tier) {
  const suffix = tier.toUpperCase();
  return {
    model: requiredEnv(`OPENAI_MODEL_${suffix}`),
    pricePerMillionIn: numberEnv(`OPENAI_PRICE_${suffix}_IN`, 0),
    pricePerMillionOut: numberEnv(`OPENAI_PRICE_${suffix}_OUT`, 0),
  };
}

export function maxTokensPerConversation(): number {
  return numberEnv("AI_MAX_TOKENS_PER_CONVERSATION", DEFAULT_MAX_TOKENS_PER_CONVERSATION);
}

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  client ??= new OpenAI({
    apiKey: requiredEnv("OPENAI_API_KEY"),
    timeout: numberEnv("AI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    maxRetries: 1,
  });
  return client;
}

/** Tests swap in a fake client. Pass null to go back to the real one. */
export function setOpenAI(fake: OpenAI | null): void {
  client = fake;
}

/*
 * Tokens used per conversation. In-memory: it resets on restart and is not shared between
 * serverless instances, so it's unreliable until it moves to Postgres. conversationId is
 * client-generated, so a caller can dodge the cap with a new id; the per-IP rate limit in
 * the route is the real abuse control.
 */
const MAX_TRACKED_CONVERSATIONS = 10_000;
const tokensByConversation = new Map<string, number>();

export function tokensUsed(conversationId: string): number {
  return tokensByConversation.get(conversationId) ?? 0;
}

function recordTokens(conversationId: string, tokens: number): void {
  const total = tokensUsed(conversationId) + tokens;
  tokensByConversation.delete(conversationId);
  tokensByConversation.set(conversationId, total);
  // Maps keep insertion order, so the first key is the least recently used.
  if (tokensByConversation.size > MAX_TRACKED_CONVERSATIONS) {
    const oldest = tokensByConversation.keys().next().value;
    if (oldest !== undefined) tokensByConversation.delete(oldest);
  }
}

export function resetBudgets(): void {
  tokensByConversation.clear();
}

export function costUsd(
  tier: Tier,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const { pricePerMillionIn, pricePerMillionOut } = tierConfig(tier);
  return (usage.inputTokens * pricePerMillionIn + usage.outputTokens * pricePerMillionOut) / 1e6;
}

function hashId(conversationId: string): string {
  return createHash("sha256").update(conversationId).digest("hex").slice(0, 12);
}

/** Metadata only. Never user text or model output. */
function logCall(fields: Record<string, string | number | boolean>): void {
  console.info(JSON.stringify({ event: "ai_call", ...fields }));
}

export type StructuredCall<S extends z.ZodType> = {
  conversationId: string;
  /** Short label for logs, e.g. "classify". */
  purpose: string;
  tier: Tier;
  schema: S;
  /** Fixed instructions. Never contains user text. */
  system: string;
  /** The user message. User text goes here only. */
  user: string;
  /** Caps output and reasoning tokens for this call. */
  maxOutputTokens: number;
};

/**
 * One structured-output call, validated with zod. Invalid or missing output becomes
 * "could_not_understand"; raw model text never leaves this function.
 */
export async function callStructured<S extends z.ZodType>(
  call: StructuredCall<S>,
): Promise<CallResult<z.infer<S>>> {
  const { conversationId, purpose, tier, schema, system, user, maxOutputTokens } = call;
  const conversation = hashId(conversationId);

  const estimate =
    Math.ceil((system.length + user.length) / CHARS_PER_TOKEN) + maxOutputTokens;
  if (tokensUsed(conversationId) + estimate > maxTokensPerConversation()) {
    logCall({ purpose, conversation, result: "budget_exceeded" });
    return { ok: false, reason: "budget_exceeded", usage: null };
  }

  let model = "";
  try {
    model = tierConfig(tier).model;
    const effort = process.env.OPENAI_REASONING_EFFORT as ReasoningEffort | undefined;
    const response = await getOpenAI().responses.create({
      model,
      instructions: system,
      input: [{ role: "user", content: user }],
      text: { format: zodTextFormat(schema, purpose) },
      max_output_tokens: maxOutputTokens,
      store: false,
      ...(effort && { reasoning: { effort } }),
    });

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const usage: Usage = {
      model,
      inputTokens,
      outputTokens,
      reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? 0,
      costUsd: costUsd(tier, { inputTokens, outputTokens }),
    };
    recordTokens(conversationId, inputTokens + outputTokens);

    const parsed = schema.safeParse(parseJson(response.output_text));
    logCall({
      purpose,
      conversation,
      model,
      inputTokens,
      outputTokens,
      reasoningTokens: usage.reasoningTokens,
      costUsd: usage.costUsd,
      valid: parsed.success,
    });
    return parsed.success
      ? { ok: true, data: parsed.data, usage }
      : { ok: false, reason: "could_not_understand", usage };
  } catch (error) {
    const timeout = error instanceof APIConnectionTimeoutError;
    logCall({
      purpose,
      conversation,
      model,
      result: timeout ? "timeout" : "error",
      error: error instanceof Error ? error.name : "unknown",
      ...(error instanceof ConfigError && { detail: error.message }),
    });
    return { ok: false, reason: timeout ? "timeout" : "error", usage: null };
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export type ModerationResult = { ok: true; flagged: boolean } | { ok: false };

/**
 * The moderation call, through this wrapper so it's logged like every other call. It's free,
 * so it costs 0 and isn't counted against the token cap on purpose: when the cap is reached it
 * is the only check left before publishing, so it must still run. Callers treat { ok: false }
 * as "couldn't check" and don't publish.
 */
export async function callModeration(
  conversationId: string,
  input: string,
): Promise<ModerationResult> {
  const purpose = "moderate";
  const conversation = hashId(conversationId);
  let model = "";
  try {
    model = requiredEnv("OPENAI_MODEL_MODERATION");
    const response = await getOpenAI().moderations.create({ model, input });
    const flagged = response.results.some((r) => r.flagged);
    logCall({ purpose, conversation, model, costUsd: 0, flagged });
    return { ok: true, flagged };
  } catch (error) {
    logCall({
      purpose,
      conversation,
      model,
      result: error instanceof APIConnectionTimeoutError ? "timeout" : "error",
      error: error instanceof Error ? error.name : "unknown",
      ...(error instanceof ConfigError && { detail: error.message }),
    });
    return { ok: false };
  }
}
