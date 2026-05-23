#!/usr/bin/env node
/**
 * agent-kanban-harness — 24h watch scheduler.
 *
 * Reads detection rules from lib/detect/rules.json, runs the detectors enabled
 * in config.js → detectors (or WATCH_ENABLED), and converts findings into kanban
 * tasks via the local API.
 *
 * No npm dependencies — only fetch / fs / setInterval — so it also runs under a
 * Deno scheduled function or a cron line. Loads <repo-root>/.env via lib/config.cjs
 * (launchd / cron don't source your shell).
 *
 * Env:
 *   WATCH_INTERVAL_MS  — base poll interval (default 300000 = 5 min)
 *   KANBAN_BASE        — http://localhost:8080 (default; or config.js port)
 *   WATCH_DRY_RUN      — "1" → log alerts, don't create tasks
 *   WATCH_ENABLED      — comma-separated detector names; overrides config.js
 *
 * Usage:
 *   node lib/watch/scheduler.cjs           # daemon
 *   node lib/watch/scheduler.cjs --once    # single sweep, then exit
 */
const fs = require("fs");
const path = require("path");
const config = require("../config.cjs");

const REPO_ROOT = config.repoRoot;
const RULES_FILE = path.join(REPO_ROOT, "lib", "detect", "rules.json");
const STATE_FILE = path.join(REPO_ROOT, "data", "runs", "watch-state.json");
const FINDINGS_DIR = path.join(REPO_ROOT, "data", "runs", "watch-findings");
const KANBAN_BASE = process.env.KANBAN_BASE || `http://localhost:${config.port}`;
const INTERVAL = parseInt(process.env.WATCH_INTERVAL_MS || "300000", 10);
const DRY_RUN = process.env.WATCH_DRY_RUN === "1";

// Built-in detectors. Add yours here (and a row in rules.json + config.js → detectors).
const detectors = {
  sentry: require("../detect/sentry.cjs"),
  vercel: require("../detect/vercel.cjs"),
  // _template: require("../detect/_template.cjs"),  // copy & rename to wire up a new one
};

// Which detectors are on? WATCH_ENABLED wins; else config.js → detectors; else rules.json.
function enabledDetectorNames() {
  const fromEnv = (process.env.WATCH_ENABLED || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (fromEnv.length) return new Set(fromEnv);
  const fromConfig = (config.detectors || []).filter((d) => d.enabled !== false).map((d) => d.detector);
  if (fromConfig.length) return new Set(fromConfig);
  return null; // null ⇒ "use rules.json `enabled` flags as-is"
}

function loadRules() {
  if (!fs.existsSync(RULES_FILE)) return { rules: [] };
  return JSON.parse(fs.readFileSync(RULES_FILE, "utf-8"));
}
function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { lastSweep: null, alerts: {} };
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); } catch { return { lastSweep: null, alerts: {} }; }
}
function saveState(s) {
  if (!fs.existsSync(path.dirname(STATE_FILE))) fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
function deduplicate(state, alert) {
  // Same source+signal+severity within 1h → skip (avoid task spam)
  const key = `${alert.source}:${alert.signal}:${alert.severity}`;
  const last = state.alerts[key];
  const now = Date.now();
  if (last && now - last < 60 * 60 * 1000) return true;
  state.alerts[key] = now;
  return false;
}

// Heartbeats, transient API errors, and missing-config notices are operational
// telemetry — they belong in sweep logs, never in the kanban backlog. Likewise any
// severity:low signal. Only medium/high actionable findings become tasks.
const INFORMATIONAL_SIGNALS = new Set(["heartbeat", "api-error", "config-missing"]);
function isInformationalOnly(alert) {
  if (alert.severity === "low") return true;
  if (INFORMATIONAL_SIGNALS.has(alert.signal)) return true;
  return false;
}

async function postTaskFromAlert(alert) {
  const body = {
    subject: `[${String(alert.severity || "medium").toUpperCase()}] ${alert.source}: ${alert.signal}`,
    description:
      `${alert.message || ""}\n\n` +
      `**Source**: ${alert.source}\n**Signal**: ${alert.signal}\n**Severity**: ${alert.severity}\n` +
      `**Threshold**: ${alert.threshold || "n/a"}\n**Value**: ${alert.value || "n/a"}\n` +
      `**Routes to**: ${alert.routesTo || "orchestrator"}\n\n` +
      (alert.evidence ? "## Evidence\n```\n" + JSON.stringify(alert.evidence, null, 2) + "\n```" : ""),
    priority: alert.severity === "high" ? "high" : alert.severity === "low" ? "low" : "medium",
    agent: alert.routesTo || "orchestrator",
    metadata: {
      source: "watch", detector: alert.source, signal: alert.signal, severity: alert.severity,
      runner: alert.severity === "high" ? "both" : "claude", tag: "alert",
    },
  };
  if (DRY_RUN) { console.log("[watch][dry-run]", JSON.stringify(body, null, 2)); return { id: "dry-run" }; }
  const r = await fetch(`${KANBAN_BASE}/api/tasks`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST /api/tasks failed: ${r.status}`);
  return await r.json();
}

async function sweepOnce() {
  const sweepId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const start = Date.now();
  const rules = loadRules();
  const state = loadState();
  const enabled = enabledDetectorNames();
  if (!fs.existsSync(FINDINGS_DIR)) fs.mkdirSync(FINDINGS_DIR, { recursive: true });

  const findings = [];
  const errors = [];

  for (const ruleSet of rules.rules || []) {
    if (enabled && !enabled.has(ruleSet.detector)) continue;
    if (!enabled && ruleSet.enabled === false) continue;
    const detector = detectors[ruleSet.detector];
    if (!detector) { errors.push({ detector: ruleSet.detector, error: "no detector module registered in scheduler.cjs" }); continue; }
    try {
      const alerts = await detector.run(ruleSet, state);
      for (const alert of alerts || []) {
        if (isInformationalOnly(alert)) { findings.push({ ...alert, suppressed: "informational — logged, not ticketed" }); continue; }
        if (deduplicate(state, alert)) { findings.push({ ...alert, deduped: true }); continue; }
        try { const task = await postTaskFromAlert(alert); findings.push({ ...alert, taskId: task.id }); }
        catch (e) { errors.push({ detector: ruleSet.detector, alert, error: e.message }); }
      }
    } catch (e) {
      errors.push({ detector: ruleSet.detector, error: e.message });
    }
  }

  state.lastSweep = new Date().toISOString();
  saveState(state);

  const summary = {
    sweepId, duration_ms: Date.now() - start,
    findings_count: findings.length,
    suppressed: findings.filter((f) => f.suppressed).length,
    deduped: findings.filter((f) => f.deduped).length,
    posted: findings.filter((f) => f.taskId).length,
    errors: errors.length,
  };
  fs.writeFileSync(
    path.join(FINDINGS_DIR, `sweep-${sweepId}.md`),
    `# Watch sweep ${sweepId}\n\n${JSON.stringify(summary, null, 2)}\n\n## Findings\n${JSON.stringify(findings, null, 2)}\n\n## Errors\n${JSON.stringify(errors, null, 2)}`,
  );
  console.log(`[watch] sweep ${sweepId} — ${summary.posted} posted / ${summary.suppressed} suppressed / ${summary.deduped} deduped / ${summary.errors} errors / ${summary.duration_ms}ms`);
  return summary;
}

async function main() {
  const isOnce = process.argv.includes("--once");
  console.log(`[watch] agent-kanban-harness watch — interval=${INTERVAL}ms dryRun=${DRY_RUN} kanban=${KANBAN_BASE}`);
  if (isOnce) { const r = await sweepOnce(); process.exit(r.errors > 0 ? 1 : 0); }
  await sweepOnce().catch((e) => console.error("[watch] sweep error:", e));
  setInterval(() => { sweepOnce().catch((e) => console.error("[watch] sweep error:", e)); }, INTERVAL);
}

if (require.main === module) main();
module.exports = { sweepOnce };
