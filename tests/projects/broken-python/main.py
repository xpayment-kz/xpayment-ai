import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import legacy_hooks
import orders
import webhooks
import xpayment

app = FastAPI(title="shop")
app.include_router(webhooks.router)
app.include_router(legacy_hooks.router)


class OrderIn(BaseModel):
    amount: float = Field(gt=0)
    description: str


@app.post("/orders", status_code=201)
def create_order(body: OrderIn):
    order = orders.create(body.amount, body.description)
    try:
        link = xpayment.create_link(order)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="payment provider is unavailable")
    orders.attach_payment(order["id"], link["payment_id"], link["qr_token"])
    return {"id": order["id"], "status": order["status"], "payment_url": link["qr_token"]}


@app.get("/orders/{order_id}")
def get_order(order_id: str):
    order = orders.get(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")
    view = {"id": order["id"], "status": order["status"]}
    if order["payment_url"]:
        view["payment_url"] = order["payment_url"]
    return view
