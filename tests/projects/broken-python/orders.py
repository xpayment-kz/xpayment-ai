import uuid

ORDERS: dict[str, dict] = {}
RECEIPTS: list[str] = []


def create(amount: float, description: str) -> dict:
    order = {
        "id": str(uuid.uuid4()),
        "amount": amount,
        "description": description,
        "status": "new",
        "payment_id": None,
        "payment_url": None,
    }
    ORDERS[order["id"]] = order
    return order


def get(order_id: str) -> dict | None:
    return ORDERS.get(order_id)


def attach_payment(order_id: str, payment_id: str, payment_url: str) -> None:
    ORDERS[order_id]["payment_id"] = payment_id
    ORDERS[order_id]["payment_url"] = payment_url


def find_by_payment(payment_id: str) -> dict | None:
    for order in ORDERS.values():
        if order["payment_id"] == payment_id:
            return order
    return None


def set_status(order_id: str, status: str) -> None:
    ORDERS[order_id]["status"] = status


def send_receipt(order: dict) -> None:
    RECEIPTS.append(order["id"])
