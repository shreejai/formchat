-- One row per lead.submitted event. event_id is the idempotency key from the sender.
CREATE TABLE leads (
    event_id       uuid PRIMARY KEY,
    tenant         text NOT NULL,
    schema_version integer NOT NULL,
    occurred_at    timestamptz NOT NULL,
    received_at    timestamptz NOT NULL DEFAULT now(),
    lead           jsonb NOT NULL,
    needs_review   boolean NOT NULL,
    ai_cost_usd    numeric(12, 6) NOT NULL
);
