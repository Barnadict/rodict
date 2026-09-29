---
name: no-task-numbers-in-github-names
description: "Never put \"Task #N\" / \"Task N:\" in GitHub-facing names or descriptions (workflows, commits, PRs, issues, releases)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: d032487d-a455-4ae9-9a0b-9b7acfe5ddb4
  modified: 2026-09-29T11:32:17.844Z
---

Don't prefix or suffix GitHub-facing names and descriptions with plan task numbers ("Task #41: …", "Collect (Task #32)"). Use plain, descriptive names: workflow `Collect`, commit `feat(collector): tiered collection cadence`, etc.

**Why:** the user finds task-numbered names hard to scan and navigate in GitHub (Actions tab, commit log, issues).

**How to apply:** applies to workflow `name:` fields, commit subjects/bodies, PR titles/descriptions, issue titles, release names. Task numbers are still fine inside PROJECT_PLAN.md and in code comments. Note `analytics.yml`'s `workflow_run` trigger matches the Collect workflow's name exactly — rename both together.
