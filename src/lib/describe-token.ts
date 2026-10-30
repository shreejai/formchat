import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requiredEnv } from "@/lib/env";

/** What /api/describe vouches for. Submit recomputes the token from what the client sends back. */
export type DescribeClaims = {
  conversationId: string;
  html: string;
  needsReview: boolean;
  costUsd: number;
};

/**
 * HMAC-SHA256 over a JSON array, so the field order is fixed and a dot or comma inside the
 * html can't shift one field into the next. Hex.
 */
export function signDescribeToken(claims: DescribeClaims): string {
  const message = JSON.stringify([
    claims.conversationId,
    claims.html,
    claims.needsReview,
    claims.costUsd,
  ]);
  return createHmac("sha256", requiredEnv("DESCRIBE_TOKEN_SECRET")).update(message).digest("hex");
}

/** Constant-time. False for anything that isn't the exact token for these claims. */
export function verifyDescribeToken(claims: DescribeClaims, token: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const expected = Buffer.from(signDescribeToken(claims), "hex");
  return timingSafeEqual(expected, Buffer.from(token, "hex"));
}
