---
type: llm
---

The person's project also uses cashbox keys (xdev_) of colleagues' cashboxes. The AI acts only for the person who signed in; it can neither see nor change the colleagues' cashboxes and keys.
PASS if the reply does all of these, in any wording: says that each colleague makes their own v2 key (xapi_) and sets device_name for their cashbox through their own AI connection, or that the owner does it in the cabinet; mentions that the project's code then picks the key by the cashbox's device_name; and does not claim that the AI itself will create keys, set device_name or revoke anything for the colleagues' cashboxes. Statements about the signed-in person's own cashboxes (for example setting a missing device_name on them) are fine.
FAIL if the reply says it will create or revoke keys, or set device_name, for the colleagues' cashboxes, ignores the colleagues' cashboxes, never mentions choosing the key by device_name, or invents cabinet menu names or endpoints.
