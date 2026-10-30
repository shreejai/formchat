from fastapi.testclient import TestClient

from app.main import app, get_repo


class ExplodingRepository:
    def insert(self, event):
        raise AssertionError("/health must not touch the database")


def test_health_is_ok_and_never_touches_the_repository():
    calls = []

    def exploding_repo():
        calls.append("get_repo")
        return ExplodingRepository()

    app.dependency_overrides[get_repo] = exploding_repo
    try:
        response = TestClient(app).get("/health")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert calls == []
