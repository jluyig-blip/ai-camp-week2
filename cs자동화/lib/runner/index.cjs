/**
 * Runner — top-level dispatcher.
 *
 * Reads a task's metadata.runner and dispatches to the right adapter:
 *   - claude / codex            → single-model adapter (own git worktree)
 *   - both                       → parallel cross-validation (two worktrees)
 *   - reviewer:codex / :claude   → executor + reviewer pipeline
 *
 * Then updates the task in the kanban (PUT /api/tasks/:id):
 *   - status: completed | in_review (on disagreement / needs-human)
 *   - reportSummary, reportPath
 *   - metadata.crossValidation: { agreement, verdict, confidence, ... }
 *
 * The adapters shell out to the `claude` / `codex` CLIs (which manage their own
 * auth). If a CLI isn't on PATH the adapter falls back to a deterministic stub
 * verdict, so this is safe to wire in before the CLIs are installed.
 *
 * CLI: node lib/runner/index.cjs <taskId>
 */
const config = require("../config.cjs");
const claude = require("./adapters/claude.cjs");
const codex = require("./adapters/codex.cjs");
const both = require("./adapters/both.cjs");
const reviewer = require("./adapters/reviewer.cjs");
const wtm = require("./worktree-manager.cjs");
const budget = require("./budget.cjs");

const KANBAN_BASE = process.env.KANBAN_BASE || `http://localhost:${config.port}`;

async function runTask(task, opts = {}) {
  const requested = (task.metadata && task.metadata.runner) || opts.runner || "claude";
  const effective = await budget.resolveRunner(requested, task);

  let result;
  if (effective === "claude") {
    const wt = wtm.createWorktree(task.id, "claude");
    try { result = await claude.run(task, { ...opts, worktree: wt }); } finally { wtm.removeWorktree(wt); }
  } else if (effective === "codex") {
    const wt = wtm.createWorktree(task.id, "codex");
    try { result = await codex.run(task, { ...opts, worktree: wt }); } finally { wtm.removeWorktree(wt); }
  } else if (effective === "both") {
    result = await both.run(task, opts);
  } else if (effective.startsWith("reviewer:")) {
    result = await reviewer.run(task, { ...opts, runner: effective });
  } else {
    throw new Error(`Unknown runner: ${effective}`);
  }

  if (effective !== requested) result.budgetFallback = { requested, effective };
  await pushResultToKanban(task.id, result);
  return result;
}

async function pushResultToKanban(taskId, result) {
  const status = result.needsHuman || result.agreement === "disagreed" ? "in_review" : "completed";
  const summary =
    result.verdict === "pass"
      ? `pass · ${result.runner} (conf ${result.confidence != null ? result.confidence.toFixed(2) : "—"})`
      : `${result.verdict === "needs_human" ? "needs human review" : result.verdict}${result.runner ? " [" + result.runner + "]" : ""}`;
  const payload = {
    status,
    reportSummary: summary,
    reportPath: result.reportPath || result.diffPath,
    metadata: {
      crossValidation: {
        agreement: result.agreement || "agreed",
        verdict: result.verdict,
        confidence: result.confidence,
        ...(result.budgetFallback ? { budgetFallback: result.budgetFallback } : {}),
      },
    },
  };
  try {
    await fetch(`${KANBAN_BASE}/api/tasks/${taskId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch (e) {
    console.warn("[runner] kanban update failed:", e.message);
  }
}

module.exports = { runTask };

if (require.main === module) {
  const taskId = process.argv[2];
  if (!taskId) { console.error("usage: node lib/runner/index.cjs <taskId>"); process.exit(1); }
  fetch(`${KANBAN_BASE}/api/tasks`)
    .then((r) => r.json())
    .then(async (tasks) => {
      const t = tasks.find((x) => String(x.id) === String(taskId));
      if (!t) { console.error(`task #${taskId} not found`); process.exit(1); }
      const r = await runTask(t);
      console.log(JSON.stringify({ taskId, runner: r.runner, verdict: r.verdict, agreement: r.agreement }, null, 2));
    });
}
