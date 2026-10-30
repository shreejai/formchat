import json
import logging
import time
import uuid

from app.signature import sign
from tests.conftest import CONTRACT_EXAMPLE, example_event, pin_clock, signed_post
from tests.test_signature import VECTOR_TIMESTAMP


def body_of(event: dict) -> bytes:
    return json.dumps(event).encode()


def test_exact_contract_example_bytes_are_stored(client, repo):
    body = CONTRACT_EXAMPLE.read_bytes()
    event_id = example_event()["event_id"]
    pin_clock(VECTOR_TIMESTAMP)

    response = signed_post(client, body, event_id, timestamp=VECTOR_TIMESTAMP)

    assert response.status_code == 200
    assert response.json() == {"status": "stored"}
    assert event_id in repo.leads


def test_valid_signature_is_stored(client, repo):
    event = example_event()
    response = signed_post(client, body_of(event), event["event_id"])
    assert response.status_code == 200
    assert response.json() == {"status": "stored"}
    assert len(repo.leads) == 1


def test_same_event_twice_is_duplicate(client, repo):
    event = example_event()
    first = signed_post(client, body_of(event), event["event_id"])
    second = signed_post(client, body_of(event), event["event_id"])
    assert first.json() == {"status": "stored"}
    assert second.status_code == 200
    assert second.json() == {"status": "duplicate"}
    assert len(repo.leads) == 1


def test_bad_signature_is_401(client, repo):
    event = example_event()
    response = signed_post(client, body_of(event), event["event_id"], secret="wrong-secret")
    assert response.status_code == 401
    assert repo.leads == {}


def test_missing_signature_is_401(client, repo):
    event = example_event()
    headers = {"X-Formchat-Event-Id": event["event_id"], "X-Formchat-Timestamp": "1"}
    response = client.post("/webhooks/leads", content=body_of(event), headers=headers)
    assert response.status_code == 401
    assert repo.leads == {}


def test_missing_timestamp_is_401(client, repo):
    event = example_event()
    body = body_of(event)
    headers = {
        "X-Formchat-Event-Id": event["event_id"],
        "X-Formchat-Signature": sign("test-secret", int(time.time()), body),
    }
    response = client.post("/webhooks/leads", content=body, headers=headers)
    assert response.status_code == 401


def test_stale_timestamp_is_401(client, repo):
    event = example_event()
    stale = int(time.time()) - 301
    response = signed_post(client, body_of(event), event["event_id"], timestamp=stale)
    assert response.status_code == 401
    assert repo.leads == {}


def test_malformed_json_is_422(client, repo):
    response = signed_post(client, b"{not json", str(uuid.uuid4()))
    assert response.status_code == 422
    assert repo.leads == {}


def test_missing_required_field_is_422(client, repo):
    event = example_event()
    del event["lead"]["title"]
    response = signed_post(client, body_of(event), event["event_id"])
    assert response.status_code == 422


def test_wrong_event_type_is_422(client):
    event = example_event()
    event["event_type"] = "lead.deleted"
    response = signed_post(client, body_of(event), event["event_id"])
    assert response.status_code == 422


def test_conversation_id_must_be_a_uuid(client):
    event = example_event()
    event["meta"]["conversation_id"] = "not-a-uuid"
    response = signed_post(client, body_of(event), event["event_id"])
    assert response.status_code == 422


def test_mismatched_event_id_is_422(client, repo):
    event = example_event()
    response = signed_post(client, body_of(event), str(uuid.uuid4()))
    assert response.status_code == 422
    assert repo.leads == {}


def test_optional_fields_absent_are_accepted(client, repo):
    event = example_event()
    for key in ["beds", "bath", "areatxt", "images"]:
        del event["lead"][key]
    event["lead"]["areatype"] = "unknown"
    response = signed_post(client, body_of(event), event["event_id"])
    assert response.json() == {"status": "stored"}
    stored = repo.leads[event["event_id"]].lead.model_dump(exclude_unset=True)
    assert "beds" not in stored and "images" not in stored


def test_numeric_values_are_accepted(client):
    event = example_event()
    event["lead"]["areatxt"] = 1200
    response = signed_post(client, body_of(event), event["event_id"])
    assert response.json() == {"status": "stored"}


def test_contact_details_never_appear_in_logs_or_errors(client, caplog):
    caplog.set_level(logging.DEBUG)
    event = example_event()
    contact = [event["lead"]["name"], event["lead"]["email"], event["lead"]["phone"]]

    stored = signed_post(client, body_of(event), event["event_id"])
    duplicate = signed_post(client, body_of(event), event["event_id"])
    event["lead"]["phone"] = ["not", "a", "scalar", event["lead"]["phone"]]
    invalid = signed_post(client, body_of(event), event["event_id"])

    assert [r.status_code for r in (stored, duplicate, invalid)] == [200, 200, 422]
    for value in contact:
        assert value not in caplog.text
        assert value not in invalid.text
