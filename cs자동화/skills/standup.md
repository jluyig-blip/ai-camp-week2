---
name: standup
description: >-
  Generate a daily standup digest of the last 24h of kanban activity — throughput,
  per-agent state, cross-validation outcomes, the second-model budget, gate runs,
  and watch findings. Use when asked for "/standup" or a daily report.
---

# /standup

A reusable Claude Code skill stub. Wire it up to your project, then expand.

When invoked:
1. `GET http://localhost:<port>/api/tasks` and `GET /api/activity?limit=500`.
2. Summarize the last 24h: tasks created / completed / moved; per-agent counts
   (total / in-progress / needs-human / completed); cross-validation outcomes
   (agreed / partial / disagreed) from `task.metadata.crossValidation`.
3. Read `data/runs/budget.json` for the second-model budget and fallback rate.
4. Scan `data/runs/gate-*/report.md` (last 24h) for pass/fail counts.
5. Scan `data/runs/watch-findings/sweep-*.md` (last 24h) for alerts posted.
6. Print a markdown digest; save it to `data/runs/standup/<YYYY-MM-DD>.md`.
7. Optionally post it to Slack if `SLACK_AGENT_WEBHOOK` is set.

Flags to support: `--since 48h`, `--post`.
