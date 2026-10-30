from app.signature import sign, verify
from tests.conftest import CONTRACT_EXAMPLE

# The test vector in docs/contracts/lead-webhook-v1.md. The sender asserts the same value.
VECTOR_SECRET = "test-secret"
VECTOR_TIMESTAMP = 1761725700
VECTOR_SIGNATURE = "sha256=70a0d6ea295e9a210294cd51bbb78a582dc10b28e1f60d9a0eb80b5468bf6be0"


def test_contract_test_vector():
    body = CONTRACT_EXAMPLE.read_bytes()
    assert sign(VECTOR_SECRET, VECTOR_TIMESTAMP, body) == VECTOR_SIGNATURE


def test_verify_accepts_a_fresh_valid_signature():
    sig = sign("s", 1000, b"{}")
    assert verify("s", "1000", sig, b"{}", now=1000)


def test_verify_allows_exactly_300_seconds_either_way():
    sig = sign("s", 1000, b"{}")
    assert verify("s", "1000", sig, b"{}", now=1300)
    assert verify("s", "1000", sig, b"{}", now=700)
    assert not verify("s", "1000", sig, b"{}", now=1301)
    assert not verify("s", "1000", sig, b"{}", now=699)


def test_verify_rejects_a_changed_body():
    sig = sign("s", 1000, b'{"a":1}')
    assert not verify("s", "1000", sig, b'{"a":2}', now=1000)


def test_verify_rejects_missing_headers():
    sig = sign("s", 1000, b"{}")
    assert not verify("s", None, sig, b"{}", now=1000)
    assert not verify("s", "1000", None, b"{}", now=1000)
    assert not verify("s", "", "", b"{}", now=1000)


def test_verify_rejects_non_integer_timestamp():
    assert not verify("s", "soon", sign("s", 1000, b"{}"), b"{}", now=1000)


def test_verify_rejects_signature_without_prefix():
    bare_hex = sign("s", 1000, b"{}").removeprefix("sha256=")
    assert not verify("s", "1000", bare_hex, b"{}", now=1000)


def test_contract_example_file_matches_the_contract():
    contract = (CONTRACT_EXAMPLE.parents[2] / "docs/contracts/lead-webhook-v1.md").read_text()
    block = contract.split("```json\n", 1)[1].split("\n```", 1)[0]
    assert CONTRACT_EXAMPLE.read_text() == block
