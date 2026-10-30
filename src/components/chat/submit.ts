import type { Answers } from "@/forms/types";
import type { Attempt } from "./state";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type SubmitBody = {
  conversationId: string;
  answers: Answers;
  pdescToken: string;
  needsReview: boolean;
  costUsd: number;
  attempts: Attempt[];
};

export type SubmitResult = { ok: true } | { ok: false; message: string };

export const submitUnavailable = "We couldn't send your listing. Please try again.";

/**
 * Sends the finished listing to /api/submit. A duplicate counts as sent: it means an earlier
 * try got through. 422 and 429 carry messages meant for the user; anything else is generic.
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
    const error = (data as { error?: unknown } | null)?.error;
    const userFacing = response.status === 422 || response.status === 429;
    return { ok: false, message: userFacing && typeof error === "string" ? error : submitUnavailable };
  } catch {
    return { ok: false, message: submitUnavailable };
  }
}
