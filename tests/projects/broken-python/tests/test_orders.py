import pytest
from fastapi.testclient import TestClient

import xpayment
from main import app


@pytest.fixture(autouse=True)
def fake_link(monkeypatch):
    def create_link(order):
        return {"payment_id": f"pay-{order['id']}", "qr_token": f"https://qr.kaspi.kz/{order['id']}"}

    monkeypatch.setattr(xpayment, "create_link", create_link)


client = TestClient(app)


def test_create_order_has_status_new():
    res = client.post("/orders", json={"amount": 1500, "description": "Two coffees"})
    assert res.status_code in (200, 201)
    order = res.json()
    assert isinstance(order["id"], str)
    assert order["status"] == "new"
    assert order["payment_url"].startswith("https://")


def test_get_order():
    created = client.post("/orders", json={"amount": 300, "description": "Tea"}).json()
    res = client.get(f"/orders/{created['id']}")
    assert res.status_code == 200
    assert res.json()["id"] == created["id"]
    assert res.json()["status"] == "new"


def test_unknown_order_is_404():
    assert client.get("/orders/nope").status_code == 404
