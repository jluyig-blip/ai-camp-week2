/**
 * Claude CLI adapter — spawns `claude` to execute a task inside the isolated git
 * worktree it's handed. Captures output under data/runs/task-<id>/claude/.
 *
 * Falls back to a deterministic stub verdict if the `claude` CLI isn't on PATH
 * (useful in CI / before the CLI is installed).
 *
 * The agent definition for the task is pulled from <repo-root>/agents/<task.agent>.md.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, execSync } = require("child_process");
const config = require("../../config.cjs");

const RUNS_DIR = path.join(config.repoRoot, "data", "runs");
const AGENTS_DIR = path.join(config.repoRoot, "agents");

function isClaudeAvailable() { try { execSync("which claude", { stdio: "ignore" }); return true; } catch { return false; } }
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function loadAgentDef(name) {
  if (!name) return null;
  const fp = path.join(AGENTS_DIR, name + ".md");
  return fs.existsSync(fp) ? fs.readFileSync(fp, "utf-8") : null;
}

function buildPrompt(task, agentDef) {
  return [
    "# Task Execution",
    "",
    `**Task ID**: ${task.id}`,
    `**Subject**: ${task.subject}`,
    `**Agent**: ${task.agent || "unassigned"}`,
    `**Status**: ${task.status}`,
    `**Application repo**: ${config.repoPath}`,
    "",
    "## Agent Definition",
    "",
    agentDef || "(no agent definition found for this agent)",
    "",
    "## Task Description",
    "",
    task.description || "(no description)",
    "",
    "## Required Output",
    "",
    "Produce a single markdown report with this structure:",
    "",
    "```markdown",
    "---",
    "verdict: pass | fail | flag | needs_human",
    "confidence: 0.0-1.0",
    "---",
    "",
    "## Summary",
    "<one paragraph>",
    "",
    "## Findings",
    "- <bullet, with file:line where applicable>",
    "",
    "## Recommended action",
    "<one of: merge | regenerate | escalate | hold>",
    "```",
    "",
    "Execute the task per your agent definition. Do not ask clarifying questions — make best-effort decisions and document them.",
  ].join("\n");
}

function parseVerdict(md) {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  let verdict = "needs_human", confidence = 0;
  if (fm) {
    const v = fm[1].match(/^verdict:\s*(\w+)/m);
    const c = fm[1].match(/^confidence:\s*([\d.]+)/m);
    if (v) verdict = v[1];
    if (c) confidence = parseFloat(c[1]);
  }
  const sm = md.match(/## Summary\s*\n([\s\S]*?)(?=\n##|$)/);
  return { verdict, confidence, summary: sm ? sm[1].trim() : "" };
}

function stubVerdict(task, runner) {
  return [
    "---", "verdict: needs_human", "confidence: 0.5", "---", "",
    "## Summary",
    `[stub:${runner}] CLI not on PATH. Task #${task.id} needs manual execution (or install the ${runner} CLI).`,
    "", "## Findings",
    `- ${runner} CLI not found — install it or add it to PATH for the runner`,
    "", "## Recommended action", "escalate",
  ].join("\n");
}

async function run(task, opts = {}) {
  const wt = opts.worktree;
  const runDir = path.join(RUNS_DIR, `task-${task.id}`, "claude");
  ensureDir(runDir);
  const start = Date.now();
  const prompt = buildPrompt(task, loadAgentDef(task.agent));
  fs.writeFileSync(path.join(runDir, "prompt.md"), prompt);

  let stdout = "", stderr = "", status = -1, mode = "live";
  if (!isClaudeAvailable()) {
    mode = "stub"; stdout = stubVerdict(task, "claude");
  } else {
    const r = spawnSync("claude", ["--print", "--model", "opus", prompt], {
      cwd: wt ? wt.path : config.repoPath, encoding: "utf-8", timeout: opts.timeout || 600000,
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    stdout = r.stdout || ""; stderr = r.stderr || ""; status = r.status === null ? -1 : r.status;
  }
  fs.writeFileSync(path.join(runDir, "stdout.md"), stdout);
  if (stderr) fs.writeFileSync(path.join(runDir, "stderr.log"), stderr);
  const parsed = parseVerdict(stdout);
  const reportPath = path.join(runDir, "report.md");
  fs.writeFileSync(reportPath, stdout);
  return { runner: "claude", mode, duration_ms: Date.now() - start, status, verdict: parsed.verdict, confidence: parsed.confidence, reportPath, summary: parsed.summary };
}

module.exports = { run, isClaudeAvailable, parseVerdict, stubVerdict, buildPrompt, loadAgentDef };
