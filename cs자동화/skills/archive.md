---
name: archive
description: >-
  Archive completed kanban tasks — move done cards out of the active board into a
  dated archive so the board stays focused. Use when asked for "/archive".
---

# /archive

A reusable Claude Code skill stub.

When invoked:
1. `GET /api/tasks`. Select tasks with `status: completed` (optionally older than N days,
   default keep the last few for visibility).
2. For each, append it to `~/.claude/tasks/_archives/<YYYY-MM>.jsonl` (preserving
   `reportPath` / `reportSummary`), then `DELETE /api/tasks/:id`.
3. Print a short summary: how many archived, and where.
4. Never archive tasks that are `in_progress`, `in_review`, or `pending`.
