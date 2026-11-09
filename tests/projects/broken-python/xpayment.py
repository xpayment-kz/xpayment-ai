import httpx

import config


def create_link(order: dict) -> dict:
    payload = {
        "amount": order["amount"],
        "device_name": config.DEVICE_NAME,
        "merchant_order_id": order["id"],
        "callback_url": f"{config.PUBLIC_URL}/webhooks/xpayment",
    }
    response = httpx.post(
        f"{config.BASE_URL}/payments/link",
        json=payload,
        headers={"Authorization": f"Bearer {config.API_KEY}"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()


def get_payment(payment_id: str) -> dict:
    response = httpx.get(
        f"{config.BASE_URL}/payments/{payment_id}",
        headers={"Authorization": f"Bearer {config.DEVICE_KEY}"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()
