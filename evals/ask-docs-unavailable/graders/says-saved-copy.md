---
type: llm
---

The live xPayment documentation could not be reached in this conversation, so the assistant had only a copy of the documentation saved in the plugin, dated 2026-11-10.
PASS if the reply explains how to verify the webhook signature (HMAC-SHA256 of the raw request body with the subscription's secret, compared with the X-xPayment-Signature header, in constant time) AND says that the live documentation was unavailable and the answer comes from a saved copy, naming its date.
FAIL if the reply does not say that it relies on a saved copy, does not give the copy's date, or the signature steps contradict the description above (for example a "sha256=" prefix in the header value, or a hash of re-serialized JSON instead of the raw body).
