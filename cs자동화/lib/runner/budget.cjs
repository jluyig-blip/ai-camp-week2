/**
 * Second-model budget enforcement + model fallback chain.
 *
 * Env-configurable:
 *   DAILY_CODEX_BUDGET=200           — max second-model (Codex/GPT) invocations per UTC day
 *   CROSS_VALIDATION_THRESHOLD=medium — severity ≥ this auto-promotes a single-model task to `both`
 *   MODEL_FALLBACK_CHAIN=sonnet,opus,haiku — Claude tiers to step through under load
 *
 * On budget exhaustion:
 *   runner=codex            → claude        (single-model fallback)
 *   runner=both             → claude        (cross-validation unavailable)
 *   runner=reviewer:codex   → claude        (review skipped)
 *
 * Tracks invocation counts in data/runs/budget.json with a daily reset.
 */
const fs = require("fs");
const path = require("path");
const config = require("../config.cjs");

const BUDGET_FILE = path.join(config.repoRoot, "data", "runs", "budget.json");
const DAILY_CAP = parseInt(process.env.DAILY_CODEX_BUDGET || "200", 10);
const THRESHOLD = (process.env.CROSS_VALIDATION_THRESHOLD || "medium").toLowerCase();
const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const FALLBACK_CHAIN = (process.env.MODEL_FALLBACK_CHAIN || "claude-sonnet-4-6,claude-opus-4-7,claude-haiku-4-5").split(",").map((s) => s.trim()).filter(Boolean);

function todayKey() { return new Date().toISOString().slice(0, 10); }
function loadBudget() {
  const fresh = { day: todayKey(), codex_calls: 0, claude_calls: 0, fallbacks: 0 };
  if (!fs.existsSync(BUDGET_FILE)) return fresh;
  try { const b = JSON.parse(fs.readFileSync(BUDGET_FILE, "utf-8")); return b.day !== todayKey() ? fresh : b; } catch { return fresh; }
}
function saveBudget(b) {
  if (!fs.existsSync(path.dirname(BUDGET_FILE))) fs.mkdirSync(path.dirname(BUDGET_FILE), { recursive: true });
  fs.writeFileSync(BUDGET_FILE, JSON.stringify(b, null, 2));
}
function codexCallsBudgeted(runner) {
  if (runner === "codex") return 1;
  if (runner === "both") return 1;                       // 1 codex + 1 claude
  if (runner.startsWith("reviewer:codex")) return 1;     // claude executes, codex reviews
  if (runner.startsWith("reviewer:claude")) return 1;    // codex executes, claude reviews
  return 0;
}

async function resolveRunner(requested, task) {
  const budget = loadBudget();
  const required = codexCallsBudgeted(requested);
  if (required === 0) { budget.claude_calls += 1; saveBudget(budget); return requested; }

  // Auto-promote single-model → both when severity warrants it (and budget allows).
  const severity = (task.metadata && task.metadata.severity) || task.priority || "medium";
  if ((requested === "claude" || requested === "codex") && SEVERITY_RANK[severity] >= SEVERITY_RANK[THRESHOLD]) {
    if (budget.codex_calls + 1 <= DAILY_CAP) { budget.codex_calls += 1; budget.claude_calls += 1; saveBudget(budget); return "both"; }
  }
  // Budget check.
  if (budget.codex_calls + required > DAILY_CAP) { budget.fallbacks += 1; budget.claude_calls += 1; saveBudget(budget); return "claude"; }
  budget.codex_calls += required;
  budget.claude_calls += requested === "both" ? 1 : 0;
  saveBudget(budget);
  return requested;
}

function getStatus() {
  const b = loadBudget();
  return { day: b.day, codex_used: b.codex_calls, codex_cap: DAILY_CAP, codex_remaining: Math.max(0, DAILY_CAP - b.codex_calls), claude_calls: b.claude_calls, fallbacks: b.fallbacks, threshold: THRESHOLD, fallback_chain: FALLBACK_CHAIN };
}
function pickClaudeModel() {
  const b = loadBudget();
  if (b.claude_calls < 200) return FALLBACK_CHAIN[0] || "claude-sonnet-4-6";
  if (b.claude_calls < 1000) return FALLBACK_CHAIN[1] || FALLBACK_CHAIN[0];
  return FALLBACK_CHAIN[FALLBACK_CHAIN.length - 1] || "claude-haiku-4-5";
}

module.exports = { resolveRunner, getStatus, pickClaudeModel, DAILY_CAP, THRESHOLD, FALLBACK_CHAIN };

if (require.main === module) console.log(JSON.stringify(getStatus(), null, 2));
