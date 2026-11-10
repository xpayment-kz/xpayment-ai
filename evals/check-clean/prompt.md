---
description: False-positive guard (needs --scaffold --allow-tools Bash). A correct integration on API v1 (a copy of legacy-v1-node). The report holds no code finding, and nothing is changed.
tags: [check]
plugins: ["../../plugin"]
model: claude-sonnet-5-5
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Bash, Edit, Write]
---

Проверь мою интеграцию xPayment
