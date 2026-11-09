---
type: llm
---

The person's live account has: cashbox shop1 («Магазин на Абая») with a Kaspi session problem since 09:20 UTC (14:20 in Kazakhstan); cashbox shop2 that works; one webhook subscription (https://shop.example/xpayment/webhook) with no secret (has_secret false), 3 failed deliveries in a row and failing since 08:30 UTC; a trial that ended on 2026-11-02 with a zero balance (status LOW_BALANCE); and a test webhook event that the subscription's URL answered with HTTP 500.
PASS if the reply names shop1 as the cashbox with the session problem (with the time in Kazakhstan time, 14:20, or UTC with the zone named), says the webhook subscription has no secret and is failing, says the tariff or trial is not active and points to topping up (the cabinet billing page), and offers a next step instead of making changes.
FAIL if the reply names shop2 as a problem, invents objects, says it already changed, deleted or rotated something, or asks the person to paste a secret or key into the chat.
