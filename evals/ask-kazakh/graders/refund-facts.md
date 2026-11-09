---
type: llm
---

PASS if the reply explains that a paid payment is refunded through the refund endpoint of the API (POST /v2/payments/{paymentID}/refund, or the v1 one) with an amount, and that a partial refund is possible (an amount smaller than the payment; the payment then becomes PARTIALLY_REFUNDED). Mentioning that a refund is asynchronous or a link to https://xpayment.kz/docs is a plus, not required.
FAIL if the reply says partial refunds are impossible, invents an endpoint or field that is not described above, or gives no way to make a refund.
