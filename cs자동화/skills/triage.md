---
name: triage
description: >-
  Triage unrouted / stale kanban tasks — apply the orchestrator's routing rules to
  assign an agent + runner, flag disagreements waiting on a human, and surface tasks
  stuck too long. Use when asked for "/triage".
---

# /triage

A reusable Claude Code skill stub. See `agents/orchestrator.md` for the routing rules.

When invoked:
1. `GET /api/tasks`. Split into: unrouted (no `agent`), in-progress past their
   timeout, `in_review` with `agreement: disagreed`, and `pending` older than N days.
2. For each unrouted task, apply the orchestrator routing rules:
   - explicit `metadata.agent` → respect it;
   - touches exactly one agent's `owns` glob → assign that agent;
   - severity ≥ medium → `runner: both`; recent regression in the area → `reviewer:codex`;
   - otherwise → label `unrouted`, leave for a human.
   `PUT /api/tasks/:id` with `agent` + `metadata.runner`.
3. List the disagreements that need a human decision (with the diff path).
4. List anything stuck too long, with a suggested next action.
5. Write a `data/runs/triage-<ts>.md` summary.
