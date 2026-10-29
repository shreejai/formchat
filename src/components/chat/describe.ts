import type { DescribeResult } from "@/lib/describe";
import { describeUnavailable } from "./messages";
import type { ChatAction } from "./state";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

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
      const error = (data as { error?: unknown } | null)?.error;
      return rejected(response.status === 429 && typeof error === "string" ? error : describeUnavailable);
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
