---
type: llm
---

The AI connection lacks the right webhooks:write, so the webhook subscription could not be created.
PASS if the reply says the subscription was not created, names the missing right webhooks:write, and tells the person how to grant it: connect (sign in to) xPayment again and allow that right on the consent page — for example through /mcp in Claude Code or the plugin's Connectors.
FAIL if the reply claims the subscription was created, does not name the missing right, gives no way to grant it, or asks the person for a token, a key or a Personal Access Token instead.
