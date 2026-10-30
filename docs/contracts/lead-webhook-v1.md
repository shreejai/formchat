# Contract: `lead.submitted` webhook, v1

The one agreement between the Next.js app (sender) and the Python service (receiver).
Both sides build and test against this file. Changing it means a new version, not an edit.

## Transport

- `POST {LEADS_SERVICE_URL}/webhooks/leads`
- `Content-Type: application/json`
- Timeout on the sender: 10 s.

## Headers

| Header                 | Value                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `X-Formchat-Event-Id`  | UUID of the outbox row. The idempotency key: the same event may arrive more than once.          |
| `X-Formchat-Timestamp` | Unix time in seconds when this attempt was sent.                                                |
| `X-Formchat-Signature` | `sha256=` + hex HMAC-SHA256 of `"{timestamp}.{raw request body}"`, keyed with `WEBHOOK_SECRET`. |

## Body

```json
{
  "event_id": "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60",
  "event_type": "lead.submitted",
  "schema_version": 1,
  "tenant": "nagpurhomes",
  "occurred_at": "2026-10-29T08:15:00Z",
  "lead": {
    "usertype": "owner",
    "listingtype": "sell",
    "ptype": "residential",
    "loc": "Dharampeth",
    "beds": "3",
    "bath": "2",
    "areatype": "builtup",
    "areatxt": "1200",
    "amount": "4500000",
    "pdesc": "<p>Spacious 3 BHK…</p>",
    "title": "3 BHK Flat in Dharampeth",
    "images": ["front.jpg"],
    "name": "Test User (mock)",
    "email": "test.user@example.com",
    "phone": "0000000000"
  },
  "meta": {
    "conversation_id": "0b7d1c3e-5a2f-4e8b-9c1d-2f3a4b5c6d7e",
    "needs_review": false,
    "ai_cost_usd": 0.0002
  }
}
```

- `lead` is exactly the output of `toSubmission()`: optional fields that were skipped are **absent**, not null. `areatype` is always present (default `"unknown"`).
- `event_id` in the body must equal the `X-Formchat-Event-Id` header.

## Test vector

Both sides assert this exact signature in their tests.

- Secret: `test-secret`
- Timestamp: `1761725700`
- Body: the JSON block under **Body** above, from the opening `{` to the closing `}`, UTF-8, LF line endings, **no trailing newline** (752 bytes). The receiver's copy is `service/tests/contract_example.json`.
- Expected `X-Formchat-Signature`: `sha256=70a0d6ea295e9a210294cd51bbb78a582dc10b28e1f60d9a0eb80b5468bf6be0`

## Receiver rules

1. Read the **raw** body bytes. Verify the signature over those exact bytes, using a constant-time comparison. Bad or missing signature → `401`.
2. Reject if the timestamp is more than **300 s** away from now (replay protection) → `401`.
3. Validate the body against the schema → `422` on failure.
4. Insert the lead keyed by `event_id`. If it already exists → `200 {"status": "duplicate"}`. Otherwise → `200 {"status": "stored"}`.
5. Never log `lead.name`, `lead.email` or `lead.phone`.

## Sender rules (outbox)

- `2xx` → mark the outbox row `delivered`.
- `5xx`, `429`, timeout or network error → keep `pending`, increase `attempts`, set `next_attempt_at` with exponential backoff (1, 2, 4, 8… minutes, capped at 60). After 10 attempts → `failed`.
- Any other `4xx` → `failed` straight away (retrying won't fix it). Record the status code.
