/**
 * Codex CLI adapter — same shape as claude.cjs, but spawns the `codex` CLI.
 * Falls back to a stub verdict if `codex` isn't on PATH.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, execSync } = require("child_process");
const config = require("../../config.cjs");
const claude = require("./claude.cjs");

const RUNS_DIR = path.join(config.repoRoot, "data", "runs");

function isCodexAvailable() { try { execSync("which codex", { stdio: "ignore" }); return true; } catch { return false; } }
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

async function run(task, opts = {}) {
  const wt = opts.worktree;
  const runDir = path.join(RUNS_DIR, `task-${task.id}`, "codex");
  ensureDir(runDir);
  const start = Date.now();
  // Reuse the same prompt builder + agent loader as the Claude adapter, for parity.
  const prompt = claude.buildPrompt(task, claude.loadAgentDef(task.agent));
  fs.writeFileSync(path.join(runDir, "prompt.md"), prompt);

  let stdout = "", stderr = "", status = -1, mode = "live";
  if (!isCodexAvailable()) {
    mode = "stub"; stdout = claude.stubVerdict(task, "codex");
  } else {
    // `codex exec -` reads the prompt from stdin (avoids ARG_MAX with multi-KB prompts).
    // (`--quiet` is not a valid `codex exec` flag — it errors out — so it was removed.)
    const r = spawnSync("codex", ["exec", "-"], {
      cwd: wt ? wt.path : config.repoPath, input: prompt, encoding: "utf-8", timeout: opts.timeout || 600000,
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    stdout = r.stdout || ""; stderr = r.stderr || ""; status = r.status === null ? -1 : r.status;
  }
  fs.writeFileSync(path.join(runDir, "stdout.md"), stdout);
  if (stderr) fs.writeFileSync(path.join(runDir, "stderr.log"), stderr);
  const parsed = claude.parseVerdict(stdout);
  const reportPath = path.join(runDir, "report.md");
  fs.writeFileSync(reportPath, stdout);
  return { runner: "codex", mode, duration_ms: Date.now() - start, status, verdict: parsed.verdict, confidence: parsed.confidence, reportPath, summary: parsed.summary };
}

module.exports = { run, isCodexAvailable };
