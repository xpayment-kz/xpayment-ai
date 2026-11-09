---
type: llm
---

The person asked what has to change in their project to move from xPayment API v1 to API v2.
PASS if the reply mentions all three changes, in any wording: (1) the base path /v1 becomes /v2; (2) the cashbox key xdev_ (XPAYMENT_DEVICE_KEY) is replaced by a v2 key xapi_; (3) device_name is added to the request that creates a payment or a link. It may also say what stays the same (reading, cancelling, refunds, webhooks) and how to roll the change out.
FAIL if any of the three is missing, or the reply invents an endpoint or a field, or says v2 is stable, or calls v1 deprecated, legacy, outdated or old.
