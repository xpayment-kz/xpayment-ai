---
type: llm
---

The assistant had no access to the person's xPayment account in this conversation: the account server was not connected.
PASS if the reply says it cannot see the person's cashboxes until they connect the xPayment account and sign in with «Войти через xPayment», tells them how to do that (for example /mcp in Claude Code), and names no cashbox, status or session problem as if it knew them.
FAIL if the reply names or describes any of the person's cashboxes or their session state, invents account data, or does not say how to sign in.
