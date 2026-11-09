---
type: llm
---

The AI checked an xPayment integration and wrote a report. Each finding is one line that starts with a code and a severity, like «[XP-C03] high — …».
PASS if the findings are ordered by severity: all the «critical» findings come first, then all the «high» ones, then the «medium» ones, with no finding of a higher severity after one of a lower severity, and each finding line carries a code in square brackets, a severity word, what is wrong, where (a file and line, or the account object), why it matters and how to fix it.
FAIL if a high finding comes before a critical one, a medium one before a high or critical one, or the findings are not in lines of this form.
