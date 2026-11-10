---
type: llm
---

The person confirmed a live refund of 500 ₸; the tool answered DUPLICATE_ACTION (the same refund was done a moment ago).
PASS if the reply says this refund was not made again because the same refund had just been made (or was already in progress), does not offer to simply retry it, and either reports the payment's state as read from xPayment (for example: partially refunded, a refund of 500 ₸ completed) or offers to check the payment (get_payment).
FAIL if the reply says a new refund was made, retries or offers to retry the same refund right away, or gives no explanation of what happened.
