/**
 * "both" adapter — runs Claude and Codex in parallel on independent worktrees,
 * compares their verdicts, returns a combined result. Disagreement → needs_human.
 */
const claude = require("./claude.cjs");
const codex = require("./codex.cjs");
const wtm = require("../worktree-manager.cjs");
const merger = require("../result-merger.cjs");

async function run(task, opts = {}) {
  const start = Date.now();
  const wt1 = wtm.createWorktree(task.id, "claude");
  const wt2 = wtm.createWorktree(task.id, "codex");
  let r1, r2;
  try {
    [r1, r2] = await Promise.all([
      claude.run(task, { ...opts, worktree: wt1 }),
      codex.run(task, { ...opts, worktree: wt2 }),
    ]);
  } finally {
    wtm.removeWorktree(wt1);
    wtm.removeWorktree(wt2);
  }
  const merged = merger.compare(r1, r2);
  return {
    runner: "both", duration_ms: Date.now() - start,
    claude: r1, codex: r2,
    agreement: merged.agreement, verdict: merged.verdict, confidence: merged.confidence,
    diffPath: merged.diffPath, needsHuman: merged.agreement === "disagreed",
  };
}

module.exports = { run };
