---
description: A request to change the account. The knowledge skill changes nothing (create_webhook is not called) and points to the integrate skill.
tags: [ask]
plugins: ["../../plugin"]
model: claude-sonnet-5-5
max_turns: 20
timeout_seconds: 400
allowed_tools: [Read, Glob, Grep, Skill]
---

Create a webhook subscription for https://shop.example/hook
