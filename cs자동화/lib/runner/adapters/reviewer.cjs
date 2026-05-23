/**
 * Reviewer adapter — one model executes, the other reviews the result.
 *
 *   reviewer:codex   — Claude does the work, Codex reviews
 *   reviewer:claude  — Codex does the work, Claude reviews
 *
 * The reviewer gets the executor's full report (no worktree, no code change) and is
 * asked to flag concerns. If it flags a needs_human/fail issue, the final verdict is
 * downgraded to needs_human and the task moves to the "needs human" column.
 */
const fs = require("fs");
const path = require("path");
const claude = require("./claude.cjs");
const codex = require("./codex.cjs");
const wtm = require("../worktree-manager.cjs");
const config = require("../../config.cjs");

const RUNS_DIR = path.join(config.repoRoot, "data", "runs");

async function run(task, opts = {}) {
  const start = Date.now();
  const mode = opts.runner || "reviewer:codex";
  const reviewerName = mode.split(":")[1];
  const executorName = reviewerName === "codex" ? "claude" : "codex";

  // Stage 1 — executor does the work in an isolated worktree.
  const wt = wtm.createWorktree(task.id, executorName);
  let exec;
  try {
    const adapter = executorName === "claude" ? claude : codex;
    exec = await adapter.run(task, { ...opts, worktree: wt });
  } finally {
    wtm.removeWorktree(wt);
  }

  // Stage 2 — reviewer inspects the executor's report (no worktree, no code change).
  const reviewerAdapter = reviewerName === "claude" ? claude : codex;
  const reviewTask = {
    id: `${task.id}-review`,
    subject: `Review: ${task.subject}`,
    agent: task.agent,
    status: "in_review",
    description: [
      `## Original task #${task.id}`,
      task.description || "",
      "",
      `## Executor (${executorName}) report`,
      "",
      `verdict: ${exec.verdict} (confidence: ${exec.confidence})`,
      "",
      exec.summary,
      "",
      "## Review request",
      "Inspect the executor's verdict, summary, and findings. Surface any risk the executor missed.",
      "Output the same frontmatter format. If you concur, set verdict = same. If you find blocking issues, set verdict = needs_human and explain in Findings.",
    ].join("\n"),
  };
  const review = await reviewerAdapter.run(reviewTask, { ...opts });

  let finalVerdict = exec.verdict;
  let agreement = "agreed";
  if (review.verdict === "needs_human" || review.verdict === "fail") { finalVerdict = "needs_human"; agreement = "disagreed"; }
  else if (review.verdict !== exec.verdict) agreement = "partial";

  const dir = path.join(RUNS_DIR, `task-${task.id}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "reviewer-summary.md"), [
    `# Reviewer flow — ${mode}`,
    "",
    `**Executor**: ${executorName} → verdict=${exec.verdict} (conf ${exec.confidence})`,
    `**Reviewer**: ${reviewerName} → verdict=${review.verdict} (conf ${review.confidence})`,
    `**Agreement**: ${agreement}`,
    `**Final verdict**: ${finalVerdict}`,
    "",
    "## Executor summary",
    exec.summary || "—",
    "",
    "## Reviewer summary",
    review.summary || "—",
  ].join("\n"));

  return {
    runner: mode, duration_ms: Date.now() - start,
    executor: exec, reviewer: review,
    agreement, verdict: finalVerdict, confidence: Math.min(exec.confidence || 0, review.confidence || 0),
    needsHuman: finalVerdict === "needs_human",
    reportPath: exec.reportPath,
  };
}

module.exports = { run };
