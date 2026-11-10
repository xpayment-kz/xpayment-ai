---
description: The start of the integrate flow. It reads the passport (get_manifest) and the account (whoami) first, and its first reply asks exactly one question, with options and the recommended one marked.
tags: [integrate]
plugins: ["../../plugin"]
model: claude-sonnet-5-5
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Подключи приём оплаты через xPayment
