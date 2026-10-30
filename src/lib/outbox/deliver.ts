import "server-only";
import { saveAttempt, type AttemptUpdate, type OutboxRow } from "@/lib/db/outbox";
import { nextState, type Outcome } from "./retry";
import { signWebhook } from "./sign";

/** The contract's sender timeout. */
export const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_ERROR_LENGTH = 200;

export type DeliverDeps = {
  fetch?: typeof fetch;
  now?: () => number;
};

export type DeliveryResult =
  | { outcome: Outcome; update: AttemptUpdate }
  /** WEBHOOK_SECRET or LEADS_SERVICE_URL is missing. Nothing was sent or written. */
  | { outcome: { kind: "unconfigured" }; update: null };

function networkError(err: unknown): string {
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  const text = typeof cause === "string" ? cause : err instanceof Error ? err.message : "error";
  return text.slice(0, MAX_ERROR_LENGTH);
}

async function send(
  row: OutboxRow,
  url: string,
  secret: string,
  fetchFn: typeof fetch,
  now: () => number,
): Promise<Outcome> {
  // Signed over exactly the bytes that are sent.
  const body = JSON.stringify(row.payload);
  const timestamp = Math.floor(now() / 1000);
  try {
    const response = await fetchFn(`${url.replace(/\/+$/, "")}/webhooks/leads`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-formchat-event-id": row.id,
        "x-formchat-timestamp": String(timestamp),
        "x-formchat-signature": signWebhook(secret, timestamp, body),
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    // The body isn't needed; drop it so the connection is freed.
    await response.body?.cancel().catch(() => {});
    return { kind: "response", status: response.status };
  } catch (err) {
    const name = (err as { name?: unknown } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") return { kind: "timeout" };
    return { kind: "network", error: networkError(err) };
  }
}

/**
 * Sends one outbox row per the contract and records the result. Never throws, so it's safe in
 * after(). Logs carry the event id and status only, never the payload.
 */
export async function deliver(row: OutboxRow, deps: DeliverDeps = {}): Promise<DeliveryResult> {
  const now = deps.now ?? Date.now;
  const secret = process.env.WEBHOOK_SECRET;
  const url = process.env.LEADS_SERVICE_URL;
  if (!secret || !url) {
    console.error(`outbox ${row.id}: WEBHOOK_SECRET or LEADS_SERVICE_URL is not set`);
    return { outcome: { kind: "unconfigured" }, update: null };
  }
  const outcome = await send(row, url, secret, deps.fetch ?? fetch, now);
  const update = nextState(row.attempts, outcome, new Date(now()));
  try {
    await saveAttempt(row.id, update);
  } catch {
    // The lease runs out and a later drain retries; the receiver dedupes on event_id.
    console.error(`outbox ${row.id}: could not save attempt (${update.status})`);
  }
  if (update.status !== "delivered") {
    console.warn(`outbox ${row.id}: ${update.status} after attempt ${update.attempts} (${update.error})`);
  }
  return { outcome, update };
}
