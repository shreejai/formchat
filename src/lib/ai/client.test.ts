import { APIConnectionTimeoutError } from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callModeration, callStructured, costUsd, resetBudgets, setOpenAI, tokensUsed } from "./client";
import { fakeOpenAI, jsonResponse, stubAiEnv } from "./test-helpers";

const schema = z.object({ label: z.enum(["yes", "no"]) });

function call(overrides: Partial<Parameters<typeof callStructured>[0]> = {}) {
  return callStructured({
    conversationId: "conv-1",
    purpose: "test",
    tier: "small",
    schema,
    system: "Answer yes or no.",
    user: "<<<DESCRIPTION\nsecret user text\nDESCRIPTION>>>",
    maxOutputTokens: 100,
    ...overrides,
  });
}

let fake: ReturnType<typeof fakeOpenAI>;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stubAiEnv();
  resetBudgets();
  fake = fakeOpenAI();
  setOpenAI(fake.client);
  log = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setOpenAI(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("callStructured", () => {
  it("returns validated data with usage and cost", async () => {
    fake.responsesCreate.mockResolvedValue(
      jsonResponse({ label: "yes" }, { input: 1000, output: 500, reasoning: 200 }),
    );
    const result = await call();
    expect(result).toEqual({
      ok: true,
      data: { label: "yes" },
      usage: {
        model: "small-test",
        inputTokens: 1000,
        outputTokens: 500,
        reasoningTokens: 200,
        // 1000 × 0.5 + 500 × 2 per million. Reasoning is inside output, not billed twice.
        costUsd: 0.0015,
      },
    });
    expect(tokensUsed("conv-1")).toBe(1500);
  });

  it("sends the model from env, strict JSON schema and the user text only in the user message", async () => {
    fake.responsesCreate.mockResolvedValue(jsonResponse({ label: "no" }));
    await call({ tier: "large" });
    const body = fake.responsesCreate.mock.calls[0][0];
    expect(body.model).toBe("large-test");
    expect(body.instructions).toBe("Answer yes or no.");
    expect(body.instructions).not.toContain("secret user text");
    expect(body.input).toEqual([
      { role: "user", content: "<<<DESCRIPTION\nsecret user text\nDESCRIPTION>>>" },
    ]);
    expect(body.text).toMatchObject({ format: { type: "json_schema", strict: true } });
    expect(body.max_output_tokens).toBe(100);
    expect(body).not.toHaveProperty("reasoning");
  });

  it("sends a reasoning effort only when configured", async () => {
    vi.stubEnv("OPENAI_REASONING_EFFORT", "minimal");
    fake.responsesCreate.mockResolvedValue(jsonResponse({ label: "no" }));
    await call();
    expect(fake.responsesCreate.mock.calls[0][0].reasoning).toEqual({ effort: "minimal" });
  });

  it.each([
    ["invalid JSON", "{label: yes"],
    ["a value outside the schema", JSON.stringify({ label: "maybe" })],
    ["empty output", ""],
  ])("returns could_not_understand for %s, still counting tokens", async (_, text) => {
    fake.responsesCreate.mockResolvedValue({
      output_text: text,
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const result = await call();
    expect(result).toMatchObject({ ok: false, reason: "could_not_understand" });
    expect(result).not.toHaveProperty("data");
    expect(tokensUsed("conv-1")).toBe(110);
  });

  it("returns timeout when the request times out", async () => {
    fake.responsesCreate.mockRejectedValue(new APIConnectionTimeoutError());
    expect(await call()).toEqual({ ok: false, reason: "timeout", usage: null });
  });

  it("returns error on other failures, including missing config", async () => {
    fake.responsesCreate.mockRejectedValue(new Error("boom"));
    expect(await call()).toMatchObject({ ok: false, reason: "error" });

    vi.stubEnv("OPENAI_MODEL_SMALL", "");
    expect(await call()).toMatchObject({ ok: false, reason: "error" });
    expect(log.mock.calls.at(-1)?.[0]).toContain("Missing env var OPENAI_MODEL_SMALL");
  });

  it("never logs user text or model output", async () => {
    fake.responsesCreate.mockResolvedValue(jsonResponse({ label: "yes" }));
    await call();
    fake.responsesCreate.mockRejectedValue(new Error("secret user text"));
    await call();
    for (const [line] of log.mock.calls) {
      expect(line).not.toContain("secret user text");
      expect(line).not.toContain("conv-1");
      expect(line).not.toContain('"yes"');
    }
  });
});

describe("callModeration", () => {
  // It used to call the SDK directly, so moderation never appeared in the ai_call log.
  it("goes through the wrapper: logged as an ai_call at zero cost, without user text", async () => {
    fake.moderationsCreate.mockResolvedValue({ results: [{ flagged: true }] });
    expect(await callModeration("conv-1", "secret user text")).toEqual({ ok: true, flagged: true });
    expect(fake.moderationsCreate).toHaveBeenCalledWith({ model: "moderation-test", input: "secret user text" });
    const line = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(line).toMatchObject({ event: "ai_call", purpose: "moderate", model: "moderation-test", costUsd: 0 });
    for (const [logged] of log.mock.calls) {
      expect(logged).not.toContain("secret user text");
      expect(logged).not.toContain("conv-1");
    }
  });

  it("still runs when the token cap is used up, and adds no tokens", async () => {
    vi.stubEnv("AI_MAX_TOKENS_PER_CONVERSATION", "1");
    fake.moderationsCreate.mockResolvedValue({ results: [{ flagged: false }] });
    expect(await callModeration("conv-1", "text")).toEqual({ ok: true, flagged: false });
    expect(tokensUsed("conv-1")).toBe(0);
  });

  it("logs and returns not-ok on failure or missing config", async () => {
    fake.moderationsCreate.mockRejectedValue(new APIConnectionTimeoutError());
    expect(await callModeration("conv-1", "text")).toEqual({ ok: false });
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toMatchObject({ purpose: "moderate", result: "timeout" });

    vi.stubEnv("OPENAI_MODEL_MODERATION", "");
    expect(await callModeration("conv-1", "text")).toEqual({ ok: false });
    expect(log.mock.calls.at(-1)?.[0]).toContain("Missing env var OPENAI_MODEL_MODERATION");
  });
});

describe("budget cap", () => {
  it("refuses a call that would go over the cap, without calling the model", async () => {
    vi.stubEnv("AI_MAX_TOKENS_PER_CONVERSATION", "1000");
    fake.responsesCreate.mockResolvedValue(
      jsonResponse({ label: "yes" }, { input: 850, output: 50, reasoning: 0 }),
    );
    expect((await call()).ok).toBe(true);
    // 900 used + an estimate of ~120 for the next call is over 1000.
    expect(tokensUsed("conv-1")).toBe(900);

    expect(await call()).toEqual({ ok: false, reason: "budget_exceeded", usage: null });
    expect(fake.responsesCreate).toHaveBeenCalledTimes(1);
  });

  it("counts the estimate of a long input before the first call", async () => {
    vi.stubEnv("AI_MAX_TOKENS_PER_CONVERSATION", "500");
    const result = await call({ user: "x".repeat(2000) });
    expect(result).toMatchObject({ ok: false, reason: "budget_exceeded" });
    expect(fake.responsesCreate).not.toHaveBeenCalled();
  });

  it("tracks each conversation separately", async () => {
    vi.stubEnv("AI_MAX_TOKENS_PER_CONVERSATION", "1000");
    fake.responsesCreate.mockResolvedValue(
      jsonResponse({ label: "yes" }, { input: 800, output: 100, reasoning: 0 }),
    );
    await call();
    expect((await call({ conversationId: "conv-2" })).ok).toBe(true);
  });

  it("defaults to 6000 tokens", async () => {
    vi.stubEnv("AI_MAX_TOKENS_PER_CONVERSATION", "");
    fake.responsesCreate.mockResolvedValue(
      jsonResponse({ label: "yes" }, { input: 5800, output: 100, reasoning: 0 }),
    );
    await call();
    expect(await call()).toMatchObject({ reason: "budget_exceeded" });
  });
});

describe("costUsd", () => {
  it("uses per-million prices from env", () => {
    expect(costUsd("large", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(25);
  });
});
