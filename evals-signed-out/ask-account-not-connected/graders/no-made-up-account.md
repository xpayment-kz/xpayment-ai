---
type: llm
---

The assistant had no access to the person's xPayment account in this conversation: the account server was not connected.
PASS if the reply says it cannot see the person's cashboxes until they connect the xPayment account and sign in, and tells them how to do that (for example /mcp in Claude Code, or «Войти через xPayment»). Mentioning the plugin version, the documentation date, the cabinet link https://xpayment.kz/app or what it will check after sign-in is fine: none of that is account data.
FAIL only if the reply states something about the person's own cashboxes as a fact (a cashbox name, how many they have, which one has a session problem or since when), or does not say how to sign in.
