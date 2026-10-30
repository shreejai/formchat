import type { Answers } from "@/forms/types";
import type { Attempt } from "@/lib/submit/shared";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type SubmitBody = {
  conversationId: string;
  answers: Answers;
  pdescToken: string;
  needsReview: boolean;
  costUsd: number;
  attempts: Attempt[];
};

export type SubmitResult =
  | { ok: true }
  /** `field` is the question key the server rejected (from a 422 `invalid:<key>` reason). */
  | { ok: false; message: string; field?: string };

export const submitUnavailable = "We couldn't send your listing. Please try again.";

/**
 * Sends the finished listing to /api/submit. A duplicate counts as sent: it means an earlier
 * try got through. 422 and 429 carry messages meant for the user; anything else is generic.
 * A 422 also names the rejected field, so the review screen can point at it.
 */
export async function submitListing(body: SubmitBody, fetchFn: Fetch = fetch): Promise<SubmitResult> {
  try {
    const response = await fetchFn("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await response.json().catch(() => null);
    const status = (data as { status?: unknown } | null)?.status;
    if (response.ok && (status === "received" || status === "duplicate")) return { ok: true };
    const { error, reason } = (data ?? {}) as { error?: unknown; reason?: unknown };
    const userFacing = response.status === 422 || response.status === 429;
    const message = userFacing && typeof error === "string" ? error : submitUnavailable;
    const field =
      response.status === 422 && typeof reason === "string" ? /^invalid:(.+)$/.exec(reason)?.[1] : undefined;
    return { ok: false, message, ...(field && { field }) };
  } catch {
    return { ok: false, message: submitUnavailable };
  }
}
