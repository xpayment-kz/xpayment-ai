---
description: A question, not a request to change anything, asked with migrate-v2 running (started with the slash command because a bare question is answered by ask from the documentation, without opening the code). In a project on API v1 the reply names the files that call /v1 (xpayment.js) and the files that read XPAYMENT_DEVICE_KEY (config.js), lists what changes for v2, and edits nothing. .env is never read.
tags: [migrate]
plugins: ["../../plugin"]
model: claude-sonnet-5-5
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write]
---

/xpayment:migrate-v2 Что нужно поменять для v2?
