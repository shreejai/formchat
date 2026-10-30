import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app, get_now, get_repo, get_secret
from app.schema import LeadEvent
from app.signature import sign

SECRET = "test-secret"
CONTRACT_EXAMPLE = Path(__file__).parent / "contract_example.json"


class FakeLeadRepository:
    """In-memory stand-in for Postgres: a dict keyed by event_id."""

    def __init__(self) -> None:
        self.leads: dict[str, LeadEvent] = {}

    def insert(self, event: LeadEvent) -> bool:
        key = str(event.event_id)
        if key in self.leads:
            return False
        self.leads[key] = event
        return True


@pytest.fixture
def repo() -> FakeLeadRepository:
    return FakeLeadRepository()


@pytest.fixture
def client(repo: FakeLeadRepository):
    app.dependency_overrides[get_repo] = lambda: repo
    app.dependency_overrides[get_secret] = lambda: SECRET
    yield TestClient(app)
    app.dependency_overrides.clear()


def example_event() -> dict:
    return json.loads(CONTRACT_EXAMPLE.read_bytes())


def signed_post(client, body: bytes, event_id: str, timestamp: int | None = None, secret=SECRET):
    if timestamp is None:
        timestamp = int(time.time())
    headers = {
        "Content-Type": "application/json",
        "X-Formchat-Event-Id": event_id,
        "X-Formchat-Timestamp": str(timestamp),
        "X-Formchat-Signature": sign(secret, timestamp, body),
    }
    return client.post("/webhooks/leads", content=body, headers=headers)


def pin_clock(timestamp: int) -> None:
    app.dependency_overrides[get_now] = lambda: float(timestamp)
