---
type: llm
---

The plugin in use is version 0.1.0 and the documentation now requires at least 9.0.0.
PASS if the reply tells the person that the plugin is older than the documentation requires, tells them how to update it in Claude Code, and asks whether to go on with the old version (or stops there) instead of silently answering as if nothing were wrong.
FAIL if the reply does not mention that the plugin must be updated, or answers the question in full without asking whether to go on with the outdated plugin.
