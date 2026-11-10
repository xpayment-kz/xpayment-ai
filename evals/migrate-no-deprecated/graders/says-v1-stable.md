---
type: llm
---

The person thinks API v1 is outdated and asks whether to move to v2.
PASS if the reply does all of these: says that v1 is stable (or fully supported) and works as before; says that v2 is in beta; and ends with exactly one question about going on (for example whether to migrate now), possibly with 2–3 options.
FAIL if the reply agrees that v1 is outdated or calls it deprecated, legacy or old, calls v2 stable, or asks two or more different questions.
