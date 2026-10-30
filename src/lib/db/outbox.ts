import "server-only";
import type { Attempt } from "@/lib/submit/shared";
import { getSql, type Row } from "./client";

export type OutboxStatus = "pending" | "delivered" | "failed";

/** What delivery needs from an outbox row. */
export type OutboxRow = { id: string; payload: Record<string, unknown>; attempts: number };

/** A transcript turn. The text is already redacted. */
export type Turn = { role: "bot" | "user"; key: string; text: string };

export type NewSubmission = {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  conversationId: string;
  tenant: string;
  turns: Turn[];
  /** Untrusted analytics; the text is already redacted. */
  attempts: Attempt[];
  needsReview: boolean;
  aiCostUsd: number;
};

/**
 * How long a row belongs to whoever just picked it up (the after() delivery or a drain) before
 * another drain may take it. Longer than one delivery attempt (10 s timeout).
 */
const LEASE = "2 minutes";

function toOutboxRow(row: Row): OutboxRow {
  return {
    id: String(row.id),
    payload: row.payload as Record<string, unknown>,
    attempts: Number(row.attempts),
  };
}

/**
 * The transcript and its outbox row in one statement, so both are written or neither is.
 * Returns null when this conversation was already submitted (nothing is written).
 */
export async function insertSubmission(s: NewSubmission): Promise<OutboxRow | null> {
  const rows = await getSql().query(
    `WITH t AS (
       INSERT INTO transcripts (conversation_id, tenant, turns, attempts, needs_review, ai_cost_usd)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
       ON CONFLICT (conversation_id) DO NOTHING
       RETURNING conversation_id
     )
     INSERT INTO outbox (id, event_type, payload, next_attempt_at)
     SELECT $7, $8, $9::jsonb, now() + interval '${LEASE}' FROM t
     RETURNING id, payload, attempts`,
    [
      s.conversationId,
      s.tenant,
      JSON.stringify(s.turns),
      JSON.stringify(s.attempts),
      s.needsReview,
      s.aiCostUsd,
      s.eventId,
      s.eventType,
      JSON.stringify(s.payload),
    ],
  );
  return rows[0] ? toOutboxRow(rows[0]) : null;
}

/** Leases up to `limit` due pending rows, oldest first. Rows another drain holds are skipped. */
export async function claimDue(limit: number): Promise<OutboxRow[]> {
  const rows = await getSql().query(
    `UPDATE outbox SET next_attempt_at = now() + interval '${LEASE}'
     WHERE id IN (
       SELECT id FROM outbox
       WHERE status = 'pending' AND next_attempt_at <= now()
       ORDER BY next_attempt_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, payload, attempts`,
    [limit],
  );
  return rows.map(toOutboxRow);
}

export type AttemptUpdate = {
  status: OutboxStatus;
  attempts: number;
  /** Only for a retry; otherwise the row keeps its value. */
  nextAttemptAt: Date | null;
  statusCode: number | null;
  error: string | null;
};

export async function saveAttempt(id: string, u: AttemptUpdate): Promise<void> {
  await getSql().query(
    `UPDATE outbox SET
       status = $2::text,
       attempts = $3,
       next_attempt_at = COALESCE($4::timestamptz, next_attempt_at),
       last_status_code = $5,
       last_error = $6,
       delivered_at = CASE WHEN $2::text = 'delivered' THEN now() ELSE delivered_at END
     WHERE id = $1`,
    [id, u.status, u.attempts, u.nextAttemptAt?.toISOString() ?? null, u.statusCode, u.error],
  );
}
