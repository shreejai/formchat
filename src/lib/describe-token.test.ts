import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signDescribeToken, verifyDescribeToken, type DescribeClaims } from "./describe-token";

const claims: DescribeClaims = {
  conversationId: "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60",
  html: "<p>Spacious 3 BHK. Near the lake.</p>",
  needsReview: false,
  costUsd: 0.0002,
};
// HMAC-SHA256("describe-test-secret", JSON.stringify([id, html, false, 0.0002])), computed with node:crypto.
const VECTOR = "20d9d13be5605b2d266801aee246a9c5c28393c785c288dea31e49c80f4a2e0b";

beforeEach(() => {
  vi.stubEnv("DESCRIBE_TOKEN_SECRET", "describe-test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("describe token", () => {
  it("matches the known HMAC vector", () => {
    expect(signDescribeToken(claims)).toBe(VECTOR);
  });

  it("verifies its own token", () => {
    expect(verifyDescribeToken(claims, VECTOR)).toBe(true);
  });

  it.each<[string, Partial<DescribeClaims>]>([
    ["html", { html: "<p>Spacious 3 BHK. Near the lake!</p>" }],
    ["needsReview", { needsReview: true }],
    ["costUsd", { costUsd: 0.0003 }],
    ["costUsd set to zero", { costUsd: 0 }],
    ["conversationId", { conversationId: "0b7d1c3e-5a2f-4e8b-9c1d-2f3a4b5c6d7e" }],
  ])("rejects the token when %s changes", (_, change) => {
    expect(verifyDescribeToken({ ...claims, ...change }, VECTOR)).toBe(false);
  });

  it("doesn't let a dot move between fields", () => {
    const a = { ...claims, conversationId: "a.b", html: "c" };
    const b = { ...claims, conversationId: "a", html: "b.c" };
    expect(signDescribeToken(a)).not.toBe(signDescribeToken(b));
  });

  it.each(["", "abc", VECTOR.toUpperCase(), `${VECTOR}00`, "z".repeat(64)])(
    "rejects a malformed token %#",
    (token) => {
      expect(verifyDescribeToken(claims, token)).toBe(false);
    },
  );

  it("rejects a token signed with another secret", () => {
    vi.stubEnv("DESCRIBE_TOKEN_SECRET", "other-secret");
    expect(verifyDescribeToken(claims, VECTOR)).toBe(false);
  });

  it("throws when the secret is unset", () => {
    vi.stubEnv("DESCRIBE_TOKEN_SECRET", "");
    expect(() => signDescribeToken(claims)).toThrow(/DESCRIBE_TOKEN_SECRET/);
  });
});
