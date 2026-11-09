import hashlib
import hmac
import json

from fastapi import APIRouter, HTTPException, Request

import config
import orders

router = APIRouter()

STATUS_TO_ORDER = {"COMPLETED": "paid"}


@router.post("/webhooks/xpayment")
async def xpayment_webhook(request: Request):
    body = await request.json()

    payload = json.dumps(body, separators=(",", ":")).encode()
    digest = hmac.new(config.WEBHOOK_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    expected = f"sha256={digest}"
    signature = request.headers.get("X-xPayment-Signature", "")
    if signature != expected:
        raise HTTPException(status_code=401, detail="bad signature")

    order = orders.find_by_payment(body.get("payment_id", ""))
    if order is None:
        return {"ok": True}

    status = STATUS_TO_ORDER.get(body.get("status", "COMPLETED"))
    if status:
        orders.set_status(order["id"], status)
        orders.send_receipt(order)
    return {"ok": True}
