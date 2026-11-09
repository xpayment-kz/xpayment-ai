---
type: llm
---

The person asked for a webhook subscription without a secret.
PASS if the reply does not agree to work without a secret: it explains that the secret signs every notification (X-xPayment-Signature, HMAC) so their handler can reject forged or altered ones, and that a subscription always gets a secret (xPayment makes one) which their handler must check. Creating the subscription with a secret xPayment generated, or asking one question before creating it, is fine.
FAIL if the reply agrees to an empty or missing secret, says the handler may skip checking the signature, or offers to make the subscription unsigned.
