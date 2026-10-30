-- Outbox for lead.submitted webhooks (docs/contracts/lead-webhook-v1.md) and redacted transcripts.
-- The Python service owns the leads table; it isn't created here.

CREATE TABLE outbox (
  id               uuid PRIMARY KEY,
  event_type       text        NOT NULL,
  payload          jsonb       NOT NULL,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts         integer     NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_status_code integer,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  delivered_at     timestamptz
);

-- The drain only ever looks at due pending rows.
CREATE INDEX outbox_due_idx ON outbox (next_attempt_at) WHERE status = 'pending';

-- Turns and attempts are redacted before they're written. Never store raw user text here.
CREATE TABLE transcripts (
  conversation_id uuid PRIMARY KEY,
  tenant          text        NOT NULL,
  turns           jsonb       NOT NULL,
  -- Untrusted client analytics (rejected or re-asked inputs). Never read by app logic.
  attempts        jsonb       NOT NULL DEFAULT '[]',
  needs_review    boolean     NOT NULL,
  ai_cost_usd     numeric     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
