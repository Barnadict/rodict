---
name: just-do-non-choice-actions
description: "User wants actions taken without asking permission unless it's a genuine choice"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: bd7c6e0b-dc21-40c5-9bf5-3fbb34bb172e
---

The user prefers that I just carry out any action without asking for permission, as long as it isn't a genuine choice/decision that's theirs to make.

**Why:** They find permission-asking on obvious/mechanical steps slows things down.

**How to apply:** Execute non-choice actions directly (installs, file edits, commits, renames, running builds/servers, etc.). Only pause to ask when there's a real decision with tradeoffs the user should own — then present options (see [[rodict-project]]). Reporting what I did afterward is still expected.
