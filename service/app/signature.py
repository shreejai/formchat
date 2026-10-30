import hashlib
import hmac

MAX_AGE_SECONDS = 300


def sign(secret: str, timestamp: int, body: bytes) -> str:
    """The X-Formchat-Signature value for this timestamp and raw body."""
    message = f"{timestamp}.".encode() + body
    digest = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def verify(
    secret: str,
    timestamp_header: str | None,
    signature_header: str | None,
    body: bytes,
    now: float,
) -> bool:
    """True only if both headers are present, the timestamp is fresh and the signature matches."""
    if not timestamp_header or not signature_header:
        return False
    try:
        timestamp = int(timestamp_header)
    except ValueError:
        return False
    if abs(now - timestamp) > MAX_AGE_SECONDS:
        return False
    expected = sign(secret, timestamp, body)
    return hmac.compare_digest(expected.encode(), signature_header.encode())
