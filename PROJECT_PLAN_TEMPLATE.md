<!-- ═══════════════════════════════════════════════════════════════════════════
     PROJECT PLAN TEMPLATE  —  v1
     ═══════════════════════════════════════════════════════════════════════════

     HOW TO USE THIS FILE
     --------------------
     1. Copy this file into a new, empty project folder and rename it PROJECT_PLAN.md.
     2. Open a Claude session in that folder and say:
            "Read PROJECT_PLAN.md and help me fill it in."
     3. Claude follows the "INSTRUCTIONS FOR CLAUDE" block below: it interviews you
        section by section, then rewrites this file as a real, filled-in plan.

     Two audiences read this file:
       • CLAUDE (assisting), which runs the interview and writes the plan.
       • The FINISHED PLAN's readers (you + future Claude sessions), after filling.

     Everything inside <!-- --> comments (including the two instruction blocks) is
     scaffolding. When Claude produces the finished plan it DELETES all of it, leaving
     only real content. {{DOUBLE-BRACE}} tokens are placeholders to replace.
     ═══════════════════════════════════════════════════════════════════════════ -->

<!-- ┌─────────────────────────────────────────────────────────────────────────┐
     │  INSTRUCTIONS FOR CLAUDE  —  read fully, then run the interview           │
     └─────────────────────────────────────────────────────────────────────────┘

     Your job: turn this template into a concrete, tailored PROJECT_PLAN.md for the
     user's project. Do NOT fill it in silently from assumptions — INTERVIEW the user.

     PRINCIPLES
     • Interview in short rounds (below), not one giant wall of questions. Ask, listen,
       reflect back what you heard, then move on. Use the AskUserQuestion tool for
       genuine either/or decisions; use plain questions for open-ended ones.
     • Propose sensible defaults for anything the user is unsure about, and say so —
       "I'll assume X unless you object." Don't stall on choices that have an obvious
       default; do stop for decisions only the user can make.
     • Research where it helps (stack fit, whether a feature is even feasible, external
       API limits, pricing tiers) instead of guessing — and tell the user what you found.
     • Keep every estimate, forecast, or assumption LABELED as such in the final plan.
       Never present a guess as a fact.
     • The plan is a living document. Tell the user it's fully editable at any time.

     INTERVIEW ROUNDS (adapt to the project — skip what doesn't apply)
       Round 1 — The idea:     one-sentence goal; who it's for; the problem it solves;
                               reference products/competitors/inspiration; what success
                               looks like; what's IN scope now vs. explicitly LATER.
       Round 2 — Shape & stack: what kind of thing is it (web app / API / CLI / mobile /
                               library / data pipeline / desktop app / …)? Preferred
                               stack or "recommend one"? If it has a UI, a visual style
                               to emulate? Solo or team? Hosting? Budget — free-tier only?
       Round 3 — Decisions &   any decisions already LOCKED (must not be re-litigated)?
                 domain:       domain terms needing precise definitions? Data model or
                               core entities? Privacy / legal / compliance constraints?
       Round 4 — Prereqs &     external accounts, credentials, API keys, or paid services
                 risks:        the user must supply (you cannot create these — list them
                               and WHEN each is first needed). Known risks or hard parts.
                               Cross-cutting standing requirements (performance, security,
                               accessibility, privacy, i18n, …).
       Round 5 — Task plan:    propose a PHASED task breakdown (foundation → core →
                               advanced → ship → polish, adapted to this project). Assign
                               each task a model hint (🟢/🟡/🔴). Show it, let the user
                               reorder/rescope/cut, then lock it in.

     AFTER THE INTERVIEW
     • Rewrite THIS FILE as the finished plan: fill every {{placeholder}}, replace or
       delete every guidance comment, drop sections that don't apply, and remove BOTH
       instruction blocks and this comment. The result should read as a clean, native
       plan with no template scaffolding left.
     • Fill the "SESSION START" block and the header so future sessions can resume.
     • Leave the Progress log with a single "Plan created {{DATE}}" entry.
     ┌─────────────────────────────────────────────────────────────────────────┐ -->

# {{PROJECT NAME}} — {{one-line description}} — Project Plan

## ▶️ SESSION START — copy/paste this at the beginning of every new session

<!-- GUIDANCE: A short prompt the user pastes to resume. Should orient a fresh Claude
     in one paragraph: what the project is, where things stand, and the working rules.
     Fill the {{...}} after the plan exists. -->

```
Read PROJECT_PLAN.md. {{One line on current state — e.g. "Last finished task: #N —
continue with #N+1" or "Build paused at X".}} Follow the plan's rules: {{list the
standing rules, e.g. optimize as you go, label every estimate/assumption explicitly,
and remind me before any task that needs a prerequisite I must provide}}. Don't start
new work without confirming with me first.
```

---

**Project name:** {{name}}
**Reference products / inspiration:** {{links or "none"}}
**UI / style reference:** {{link or "n/a — no UI" }}
**Recommended stack:** {{languages · frameworks · libraries · data · infra · hosting}}
**Goal:** {{One or two sentences: what it does, for whom, and why. State it as an
outcome, not a feature list.}}
**Current scope:** {{what "done enough" means for v1}}. **Later (out of scope now):** {{deferred ideas}}.

---

## How to resume across sessions

1. Open a new session in this project.
2. Say: **"Read PROJECT_PLAN.md. Last finished task: #N — continue."**
3. Claude reads this file + the existing code, does task **#N+1**, and checks it off here.

The plan is fully editable — reorder, rescope, swap the stack, or add/remove tasks anytime.
<!-- GUIDANCE: If the project has any time-sensitive element (data that only accumulates
     from day one, a deadline, an external dependency with a clock), call it out here. -->
{{Any time-sensitive note, or delete this line.}}

---

## Locked decisions

<!-- GUIDANCE: Decisions made up front that shape everything downstream and should NOT
     be re-argued each session. Include the WHY — a locked decision without its reason
     gets quietly reversed later. Delete this section if nothing is locked yet. -->

- **{{Decision}}:** {{what was decided}} — {{why it's locked}}.
- **{{Decision}}:** {{…}}.

---

## Prerequisites you (the user) must provide

<!-- GUIDANCE: Things Claude CANNOT do — create accounts, verify emails, enter payment,
     click OAuth screens, provision paid infra. List each, WHEN it's first needed, cost,
     and notes. Then state the REMINDER PROTOCOL so Claude pauses before a blocked task
     instead of failing on it. If the whole project is fully local with no external
     prerequisites, say so and delete the table. -->

Claude cannot create external accounts, verify emails, enter payment info, or click
OAuth/login screens. **Reminder protocol: when Claude reaches a task that needs one of
these, it pauses and reminds you before proceeding.**

Local tooling assumed present: {{runtimes/CLIs, e.g. Node, Python, git — verify at start}}.

| #   | What you provide           | Needed at   | Cost      | Notes             |
| --- | -------------------------- | ----------- | --------- | ----------------- |
| 1   | {{account / credential}}   | {{Task #N}} | {{Free?}} | {{decision/note}} |
| 2   | {{…}}                      | {{…}}       | {{…}}     | {{…}}             |

**Settled choices:** {{name}} · {{hosting}} · {{other locked externals}}.

---

## Standing requirements

<!-- GUIDANCE: Cross-cutting rules that apply to ALL work, not a one-time task — e.g.
     performance/optimization, security, accessibility, privacy, test coverage, i18n.
     Keep each concrete and verifiable ("index lookup columns", "never log secrets",
     "each feature must not regress load time"), not aspirational. List only the ones
     this project actually needs. -->

**{{Requirement, e.g. Performance & optimization}} — applies to all work, verified per task.**

- **{{Area}}:** {{concrete rule}}.
- **{{Area}}:** {{concrete rule}}.
- **Guardrail:** {{how "done" is checked against this requirement}}.

---

## Key feasibility notes

<!-- GUIDANCE: What's genuinely doable vs. what's estimated, approximated, or impossible,
     and any cold-start / "gets better with time or data" caveats. This is where honesty
     about limits lives — it prevents promising what can't be delivered. Delete if n/a. -->

- **Doable now:** {{…}}.
- **Estimated / approximate:** {{what can only be approximated, and how it's labeled}}.
- **Constraints:** {{rate limits, API gaps, platform limits, legal/ToS}}.

---

## Architecture & infrastructure

<!-- GUIDANCE: The moving pieces and how they fit — services, data stores, jobs, hosting.
     If free-tier / budget-constrained, show the split that works and WHY. A small table
     of Piece → Choice → Role reads well. Delete if trivial (a single local script). -->

| Piece      | Choice            | Role            |
| ---------- | ----------------- | --------------- |
| {{piece}}  | {{choice}}        | {{what it does}}|

**Why this works:** {{one or two sentences on the key architectural bet}}.

---

## Risks & operational concerns

<!-- GUIDANCE: What could break, get blocked, or be lost — with a mitigation for each.
     Be specific to this project (a rate limit you'll actually hit, a single point of
     data loss, an unattended job that fails silently), not generic boilerplate. -->

- **{{Risk}}:** {{how it bites}}. Mitigation: {{plan}}.
- **{{Risk}}:** {{…}}. Mitigation: {{…}}.

---

## Definitions

<!-- GUIDANCE: A glossary of domain terms the plan uses precisely. Only include terms
     whose meaning is non-obvious or project-specific. Skip if there are none. -->

- **{{Term}}:** {{precise definition}}.
- **{{Term}}:** {{…}}.

---

## Task list

Legend: `[ ]` todo · `[x]` done
Model hint (right after each task number): 🟢 = a smaller/faster model can handle it ·
🟡 = borderline (attempt with a smaller model, escalate if needed) · 🔴 = use the
strongest model. Switch models manually per task.

<!-- GUIDANCE: Break the work into PHASES that build on each other. A typical arc:
       Phase 0  Foundation  — scaffold, tooling, repo, base structure
       Phase 1  Core data / domain layer
       Phase 2  Core features (the primary value)
       Phase 3  Advanced features
       Phase 4  Deployment / release
       Phase 5  Polish & quality (tests, a11y, perf, docs, README)
     Adapt names/count to the actual project. Each task = one shippable, verifiable
     unit of work, phrased as an action with a clear "done" condition. Add a model hint.
     Keep tasks small enough to finish and check off in a session. -->

### Phase 0: {{Foundation}}

- [ ] **1.** 🟢 {{Task — action + how it's verified done}}.
- [ ] **2.** 🟢 {{…}}.

### Phase 1: {{…}}

- [ ] **3.** 🟡 {{…}}.

### Phase 2: {{…}}

- [ ] **4.** 🔴 {{…}}.

<!-- …continue phases and tasks as the interview establishes them… -->

### Later (out of scope for now)

- {{deferred idea}}.
- {{deferred idea}}.

---

## Notes

<!-- GUIDANCE: Optional. Any cross-cutting notes that don't fit above — data-science
     caveats, a compute-split rationale, a design philosophy ("descriptive, not
     prescriptive"), etc. Delete if unused. -->

- {{note}}.

---

## Progress log

_(Claude appends a one-line note here each time a task is completed — what shipped,
anything surprising, and what's next.)_

- _Plan created {{DATE}}._
