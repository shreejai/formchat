import logging
import time
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.repository import LeadRepository, PostgresLeadRepository
from app.schema import LeadEvent
from app.settings import get_settings
from app.signature import verify

logger = logging.getLogger("formchat.service")

app = FastAPI(title="formchat-service")


def get_repo() -> LeadRepository:
    return PostgresLeadRepository(get_settings().database_url)


def get_secret() -> str:
    return get_settings().webhook_secret


def get_now() -> float:
    return time.time()


@app.get("/health")
def health() -> dict:
    # No database here: this is pinged to keep the host awake and must not wake Neon.
    return {"ok": True}


@app.post("/webhooks/leads")
async def receive_lead(
    request: Request,
    repo: Annotated[LeadRepository, Depends(get_repo)],
    secret: Annotated[str, Depends(get_secret)],
    now: Annotated[float, Depends(get_now)],
) -> JSONResponse:
    body = await request.body()
    headers = request.headers

    if not verify(
        secret,
        headers.get("x-formchat-timestamp"),
        headers.get("x-formchat-signature"),
        body,
        now,
    ):
        return JSONResponse({"detail": "invalid signature"}, status_code=401)

    try:
        event = LeadEvent.model_validate_json(body)
    except ValidationError as exc:
        # Only where and why it failed. Pydantic's default error includes the input
        # values, which could contain contact details.
        errors = [{"loc": e["loc"], "type": e["type"]} for e in exc.errors()]
        return JSONResponse({"detail": errors}, status_code=422)

    if str(event.event_id) != headers.get("x-formchat-event-id", "").lower():
        return JSONResponse({"detail": "event_id does not match header"}, status_code=422)

    # psycopg is synchronous; run it on a worker thread so it doesn't block other requests.
    inserted = await run_in_threadpool(repo.insert, event)
    status = "stored" if inserted else "duplicate"
    # Never the body: it contains the lead's name, email and phone.
    logger.info(
        "lead webhook event_id=%s tenant=%s status=%s", event.event_id, event.tenant, status
    )
    return JSONResponse({"status": status})
