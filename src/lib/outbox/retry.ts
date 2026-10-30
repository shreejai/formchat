import type { AttemptUpdate } from "@/lib/db/outbox";

/** After this many failed attempts a retryable row is marked failed. */
export const MAX_ATTEMPTS = 10;
const MAX_BACKOFF_MINUTES = 60;

export type Outcome =
  | { kind: "response"; status: number }
  | { kind: "timeout" }
  | { kind: "network"; error: string };

/** 1, 2, 4, 8… minutes after the 1st, 2nd, 3rd… failure, capped at 60. */
export function backoffMinutes(attempts: number): number {
  return Math.min(2 ** (attempts - 1), MAX_BACKOFF_MINUTES);
}

function isPermanent(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

/**
 * The contract's sender rules. `attempts` is the count before this one.
 * 2xx → delivered. Any other 4xx → failed now. 5xx, 429, other statuses, timeouts and
 * network errors → retry with backoff, failed once MAX_ATTEMPTS is reached.
 */
export function nextState(attempts: number, outcome: Outcome, now: Date): AttemptUpdate {
  const count = attempts + 1;
  const statusCode = outcome.kind === "response" ? outcome.status : null;
  const error =
    outcome.kind === "response"
      ? `HTTP ${outcome.status}`
      : outcome.kind === "timeout"
        ? "timeout"
        : outcome.error;

  if (statusCode !== null && statusCode >= 200 && statusCode < 300) {
    return { status: "delivered", attempts: count, nextAttemptAt: null, statusCode, error: null };
  }
  if ((statusCode !== null && isPermanent(statusCode)) || count >= MAX_ATTEMPTS) {
    return { status: "failed", attempts: count, nextAttemptAt: null, statusCode, error };
  }
  const nextAttemptAt = new Date(now.getTime() + backoffMinutes(count) * 60_000);
  return { status: "pending", attempts: count, nextAttemptAt, statusCode, error };
}
