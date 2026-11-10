---
description: create_webhook answers SCOPE_REQUIRED (webhooks:write); whoami shows every scope, so the error comes from the tool. create_webhook is called exactly once (not retried); the reply names the missing right and how to grant it (connect again, allow it on the consent page).
tags: [integrate]
model: claude-sonnet-5-5
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

/xpayment:integrate Создай тестовый вебхук в песочнице на https://shop.example/webhooks/xpayment
