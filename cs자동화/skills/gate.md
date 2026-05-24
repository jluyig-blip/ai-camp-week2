---
name: gate
description: >-
  Run the pre-deploy gate (config.js → deployCommands + optional bundle inspection)
  and report pass/fail per stage. Use when asked for "/gate" or before a deploy.
---

# /gate

A reusable Claude Code skill stub. The gate itself is `lib/gate/index.cjs`.

When invoked:
1. Run `node lib/gate/index.cjs` (or `npm run gate`) from the harness root. It
   executes `config.js → deployCommands` in order, fail-fast, from `config.js → repoPath`,
   then an optional bundle-inspection stage.
2. Read the run report at `data/runs/gate-<ts>/report.md` and relay the verdict +
   per-stage status. On failure, point at the failing stage's log
   (`data/runs/gate-<ts>/<stage>.log`) and the auto-created "needs human" task.
3. If the gate failed, do NOT proceed to deploy. Fix the failing stage, re-run.

The hard gate (`hooks/pre-push.sample`) runs the same thing on `git push`; a human
can override with `KANBAN_GATE_BYPASS=1 git push` (audit-logged).
