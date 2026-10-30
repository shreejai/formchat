from typing import Protocol

import psycopg
from psycopg.types.json import Jsonb

from app.schema import LeadEvent

INSERT_LEAD = """
INSERT INTO leads (event_id, tenant, schema_version, occurred_at, lead, needs_review, ai_cost_usd)
VALUES (%s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (event_id) DO NOTHING
"""


class LeadRepository(Protocol):
    def insert(self, event: LeadEvent) -> bool:
        """Store the lead. True if it was new, False if this event_id was already stored."""
        ...


class PostgresLeadRepository:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def insert(self, event: LeadEvent) -> bool:
        # exclude_unset: optional fields the sender left out stay absent in the jsonb.
        lead = event.lead.model_dump(mode="json", exclude_unset=True)
        # One short connection per webhook: simple, and Neon only wakes when a lead arrives.
        with psycopg.connect(self.database_url) as conn:
            cur = conn.execute(
                INSERT_LEAD,
                (
                    event.event_id,
                    event.tenant,
                    event.schema_version,
                    event.occurred_at,
                    Jsonb(lead),
                    event.meta.needs_review,
                    event.meta.ai_cost_usd,
                ),
            )
            return cur.rowcount == 1
