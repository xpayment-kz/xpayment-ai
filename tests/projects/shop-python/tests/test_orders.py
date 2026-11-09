from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_create_order_has_status_new():
    res = client.post("/orders", json={"amount": 1500, "description": "Two coffees"})
    assert res.status_code in (200, 201)
    order = res.json()
    assert isinstance(order["id"], str)
    assert order["status"] == "new"


def test_get_order():
    created = client.post("/orders", json={"amount": 300, "description": "Tea"}).json()
    res = client.get(f"/orders/{created['id']}")
    assert res.status_code == 200
    assert res.json()["id"] == created["id"]
    assert res.json()["status"] == "new"


def test_unknown_order_is_404():
    assert client.get("/orders/nope").status_code == 404


def test_bad_body_is_rejected():
    assert client.post("/orders", json={"amount": "a lot"}).status_code == 422
