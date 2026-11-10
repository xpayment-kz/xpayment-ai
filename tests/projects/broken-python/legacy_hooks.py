from fastapi import APIRouter, Request

import orders
import xpayment

router = APIRouter()


@router.post("/hooks/xpayment/refunds")
async def refund_hook(request: Request):
    event = await request.json()
    if event.get("event") != "payment.refunded":
        return {"ok": True}

    payment = xpayment.get_payment(event["payment_id"])
    order = orders.find_by_payment(event["payment_id"])
    if order is not None and payment["status"] in ("REFUNDED", "PARTIALLY_REFUNDED"):
        orders.set_status(order["id"], "refunded")
    return {"ok": True}
