import type { DescribeResult } from "@/lib/describe";
import { describeUnavailable } from "./messages";
import type { ChatAction } from "./state";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

type UuidSource = Pick<Crypto, "getRandomValues"> & { randomUUID?: () => string };

/**
 * A v4 UUID for the conversation. crypto.randomUUID only exists in secure contexts, so on plain
 * HTTP (e.g. `next dev` opened from a phone on the LAN) it's built from getRandomValues, which
 * is always there.
 */
export function newConversationId(source: UuidSource = crypto): string {
  if (typeof source.randomUUID === "function") return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isDescribeResult(data: unknown): data is DescribeResult {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  if (d.status === "reask" || d.status === "blocked") return typeof d.message === "string";
  return (
    d.status === "accepted" &&
    typeof d.html === "string" &&
    (d.suggestedTitle === null || typeof d.suggestedTitle === "string") &&
    typeof d.needsReview === "boolean"
  );
}

/**
 * Sends a description to /api/describe and returns the chat action for the reply.
 * Network errors, rate limits and unexpected replies become a re-ask, so the user can retry.
 */
export async function describeAnswer(
  key: string,
  text: string,
  conversationId: string,
  fetchFn: Fetch = fetch,
): Promise<ChatAction> {
  const rejected = (message: string): ChatAction => ({
    type: "describeRejected",
    key,
    input: text,
    message,
  });
  try {
    const response = await fetchFn("/api/describe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, text }),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      // Rate limits and oversized text have messages meant for the user; resending won't help.
      const error = (data as { error?: unknown } | null)?.error;
      const userFacing = response.status === 429 || response.status === 413;
      return rejected(userFacing && typeof error === "string" ? error : describeUnavailable);
    }
    if (!isDescribeResult(data)) return rejected(describeUnavailable);
    if (data.status !== "accepted") return rejected(data.message);
    return {
      type: "describeAccepted",
      key,
      html: data.html,
      suggestedTitle: data.suggestedTitle,
      needsReview: data.needsReview,
    };
  } catch {
    return rejected(describeUnavailable);
  }
}
