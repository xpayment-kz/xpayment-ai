---
type: llm
---

The AI checked the code of an xPayment integration that is correct (signature checked on the raw body in constant time, repeated delivery ids ignored, the payment read after each event, all statuses handled, an idempotency key sent, the right key for the API version).
PASS if the reply says that it found no problems in the code (in any wording) and lists no code defect as a finding. Findings about the account (cashboxes, webhook subscriptions, tariff) are fine. Plain-language remarks or optional suggestions about the code (for example that processed ids or orders live in memory, that the idempotency key is new for each request, that the webhook path should be compared with the subscription URL, or that a migration to API v2 is possible) are not findings.
FAIL only if the reply presents a defect of the code as a finding, for example as a line with a code in square brackets, or says that the signature check, the secret, the key or API version, the status handling, the idempotency key or the handling of repeated deliveries is wrong, missing or insecure.
