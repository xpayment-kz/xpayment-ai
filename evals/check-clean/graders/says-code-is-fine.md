---
type: llm
---

The AI checked the code of an xPayment integration that is correct (signature checked on the raw body in constant time, repeated delivery ids ignored, the payment read after each event, all statuses handled, an idempotency key sent, the right key for the API version).
PASS if the reply says that it found no problems in the code (in any wording) and does not claim a code problem. Remarks about the account (cashboxes, webhooks, tariff) or optional suggestions are fine as long as they are not presented as errors of the code.
FAIL if the reply claims the code has a signature, secret, key, idempotency, status, repeated-delivery or API-version problem.
