import uuid

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(title="shop")

ORDERS: dict[str, dict] = {}


class OrderIn(BaseModel):
    amount: float = Field(gt=0)
    description: str


@app.post("/orders", status_code=201)
def create_order(body: OrderIn):
    order = {
        "id": str(uuid.uuid4()),
        "amount": body.amount,
        "description": body.description,
        "status": "new",
    }
    ORDERS[order["id"]] = order
    return {"id": order["id"], "status": order["status"]}


@app.get("/orders/{order_id}")
def get_order(order_id: str):
    order = ORDERS.get(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")
    view = {"id": order["id"], "status": order["status"]}
    if order.get("payment_url"):
        view["payment_url"] = order["payment_url"]
    return JSONResponse(view)
