from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

# toSubmission() values are strings or numbers (e.g. areatxt can be 1200 or "1200").
Scalar = str | int | float


class Lead(BaseModel):
    # Extra keys are kept: lead is stored as jsonb, and a new optional form field
    # shouldn't make delivery fail.
    model_config = ConfigDict(extra="allow")

    usertype: Scalar
    listingtype: Scalar
    ptype: Scalar
    loc: Scalar
    areatype: Scalar
    amount: Scalar
    pdesc: Scalar
    title: Scalar
    name: Scalar
    email: Scalar
    phone: Scalar
    # Optional: skipped fields are absent from the body, never null.
    beds: Scalar | None = None
    bath: Scalar | None = None
    areatxt: Scalar | None = None
    images: list[str] | None = None


class Meta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_id: UUID
    needs_review: bool
    ai_cost_usd: float


class LeadEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: UUID
    event_type: Literal["lead.submitted"]
    schema_version: Literal[1]
    tenant: str
    occurred_at: datetime
    lead: Lead
    meta: Meta
