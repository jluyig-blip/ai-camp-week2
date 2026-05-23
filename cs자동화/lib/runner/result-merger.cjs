/**
 * Result merger — compares two runner results, classifies agreement, and writes a
 * diff file for the "needs human" column to link to.
 */
const fs = require("fs");
const path = require("path");
const config = require("../config.cjs");

const RUNS_DIR = path.join(config.repoRoot, "data", "runs");

function compare(r1, r2) {
  // Recover the task id from either report path: data/runs/task-<id>/...
  const taskDir = [r1.reportPath, r2.reportPath].map((p) => (p || "").split(path.sep).find((seg) => seg.startsWith("task-"))).find(Boolean) || "task-unknown";
  const dir = path.join(RUNS_DIR, taskDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const diffPath = path.join(dir, "diff.md");

  let agreement, verdict, confidence;
  if (r1.verdict === r2.verdict) {
    agreement = "agreed"; verdict = r1.verdict; confidence = ((r1.confidence || 0) + (r2.confidence || 0)) / 2;
  } else if (r1.verdict === "needs_human" || r2.verdict === "needs_human" || r1.verdict === "fail" || r2.verdict === "fail") {
    agreement = "disagreed"; verdict = "needs_human"; confidence = 0;
  } else {
    agreement = "partial";
    verdict = (r1.confidence || 0) < (r2.confidence || 0) ? r1.verdict : r2.verdict;  // conservative: lower-confidence verdict wins
    confidence = Math.min(r1.confidence || 0, r2.confidence || 0);
  }

  const md = [
    "# Cross-validation diff",
    "",
    "| field | claude | codex |",
    "|---|---|---|",
    `| verdict | ${r1.verdict} | ${r2.verdict} |`,
    `| confidence | ${r1.confidence} | ${r2.confidence} |`,
    `| duration_ms | ${r1.duration_ms} | ${r2.duration_ms} |`,
    `| mode | ${r1.mode || "live"} | ${r2.mode || "live"} |`,
    "",
    `**Agreement**: ${agreement}`,
    `**Final verdict**: ${verdict}`,
    `**Final confidence**: ${confidence.toFixed(2)}`,
    "",
    "## Claude summary",
    r1.summary || "—",
    "",
    "## Codex summary",
    r2.summary || "—",
    "",
    "## Action",
    agreement === "agreed" ? "Auto-merge — both models concur." :
    agreement === "partial" ? "Lower-confidence verdict adopted; review optional." :
    "**Disagreed → moved to the \"needs human\" column. A human decides which verdict to take.**",
  ].join("\n");
  fs.writeFileSync(diffPath, md);
  return { agreement, verdict, confidence, diffPath };
}

module.exports = { compare };
