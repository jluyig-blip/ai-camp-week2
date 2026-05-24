#!/usr/bin/env node
/**
 * Pre-deploy gate.
 *
 * Runs config.js → deployCommands serially (fail-fast) from config.js → repoPath,
 * then an optional bundle-inspection stage (if config.js → buildOutputDir is set).
 * Each stage writes its own log under data/runs/gate-<ts>/, plus a summary report.md.
 * On failure, auto-creates a kanban task in the "needs human" column (disable with
 * GATE_NO_KANBAN=1).
 *
 * Exit codes: 0 = pass; N = the (1-based) index of the failed deployCommands stage;
 * if bundle inspection warns and STRICT_BUNDLE=1, exit = deployCommands.length + 1.
 *
 * Env: GATE_TIMEOUT_MS (per stage, default 600000), STRICT_BUNDLE, GATE_NO_KANBAN.
 *
 * Usage:  npm run gate   (or  node lib/gate/index.cjs)
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawnSync } = require("child_process");
const config = require("../config.cjs");

const REPO = config.repoPath;
const HARNESS_ROOT = config.repoRoot;
const RUNS_DIR = path.join(HARNESS_ROOT, "data", "runs");
const GATE_TIMEOUT = config.gateTimeoutMs;
const KANBAN_PORT = config.port;

function ts() { return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19); }
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function currentBranch() {
  try { return (spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: REPO, encoding: "utf-8" }).stdout || "").trim() || "unknown"; }
  catch { return "unknown"; }
}

function runStage(name, cmd, args, dir, env = {}) {
  const start = Date.now();
  const logFile = path.join(dir, `${name}.log`);
  process.stdout.write(`[gate] ${name} → ${cmd} ${args.join(" ")} (cwd=${REPO})\n`);
  const result = spawnSync(cmd, args, { cwd: REPO, timeout: GATE_TIMEOUT, encoding: "utf-8", env: { ...process.env, FORCE_COLOR: "0", ...env } });
  const stdout = result.stdout || "", stderr = result.stderr || "";
  const status = result.status === null ? -1 : result.status;
  fs.writeFileSync(logFile, `# ${name}\nexit_code: ${status}\nduration_ms: ${Date.now() - start}\ncwd: ${REPO}\ncmd: ${cmd} ${args.join(" ")}\n\n## stdout\n${stdout}\n\n## stderr\n${stderr}\n`);
  return { name, passed: status === 0, status, duration: Date.now() - start, logFile, stdout, stderr };
}

function walkSize(root) {
  let total = 0, count = 0; const all = [];
  (function walk(p) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) { const s = fs.statSync(full).size; total += s; count++; all.push({ path: path.relative(root, full), size: s }); }
    }
  })(root);
  all.sort((a, b) => b.size - a.size);
  return { total, count, largest: all.slice(0, 5) };
}

function inspectBundle(dir) {
  if (!config.buildOutputDir) return { name: `${String(config.deployCommands.length + 1).padStart(2, "0")}-inspect`, passed: true, status: 0, duration: 0, skipped: true, note: "buildOutputDir not configured" };
  const outDir = path.join(REPO, config.buildOutputDir);
  const stageName = `${String(config.deployCommands.length + 1).padStart(2, "0")}-inspect`;
  if (!fs.existsSync(outDir)) return { name: stageName, passed: true, status: 0, duration: 0, skipped: true, note: `${config.buildOutputDir}/ not found` };
  const sizes = walkSize(outDir);
  const totalKB = Math.round(sizes.total / 1024);
  fs.writeFileSync(path.join(dir, `${stageName}.log`),
    `total: ${totalKB} KB\nfile_count: ${sizes.count}\nlargest:\n` + sizes.largest.map((f) => `  ${(f.size / 1024).toFixed(1)} KB  ${f.path}`).join("\n"));
  let baseline = null;
  const lastGateFile = path.join(RUNS_DIR, "last-gate.json");
  if (fs.existsSync(lastGateFile)) { try { baseline = JSON.parse(fs.readFileSync(lastGateFile, "utf-8")); } catch {} }
  let warning = null;
  if (baseline && baseline.totalKB) {
    const delta = ((totalKB - baseline.totalKB) / baseline.totalKB) * 100;
    if (delta > 10) warning = `bundle +${delta.toFixed(1)}% (was ${baseline.totalKB} KB, now ${totalKB} KB)`;
  }
  return { name: stageName, passed: !warning, status: warning ? 1 : 0, duration: 0, totalKB, fileCount: sizes.count, warning };
}

function finalize(dir, tag, stages, exitCode) {
  const reportPath = path.join(dir, "report.md");
  const totalDuration = stages.reduce((n, s) => n + (s.duration || 0), 0);
  const passed = exitCode === 0;
  const branch = currentBranch();
  let md = `# Gate Run · ${tag}\n\n**Branch**: ${branch}\n**Verdict**: ${passed ? "✓ PASS" : "✗ FAIL"} (exit ${exitCode})\n**Total duration**: ${(totalDuration / 1000).toFixed(1)}s\n\n## Stages\n\n| # | stage | status | duration | note |\n|---|---|---|---|---|\n`;
  stages.forEach((s, i) => {
    const status = s.skipped ? "⊘ skipped" : s.passed ? "✓ pass" : "✗ fail";
    md += `| ${i + 1} | ${s.name} | ${status} | ${s.duration ? (s.duration / 1000).toFixed(1) + "s" : "—"} | ${s.warning || s.note || ""} |\n`;
  });
  md += `\n## Logs\n\n`;
  stages.forEach((s) => { if (s.logFile) md += `- ${path.relative(HARNESS_ROOT, s.logFile)}\n`; });
  fs.writeFileSync(reportPath, md);

  if (passed) {
    const insp = stages.find((s) => s.name.endsWith("-inspect"));
    if (insp && insp.totalKB) { ensureDir(RUNS_DIR); fs.writeFileSync(path.join(RUNS_DIR, "last-gate.json"), JSON.stringify({ tag, totalKB: insp.totalKB, fileCount: insp.fileCount, completedAt: new Date().toISOString() }, null, 2)); }
  }

  let pending = null;
  if (!passed && process.env.GATE_NO_KANBAN !== "1") {
    pending = notifyFailure({ tag, dir, branch, stages, exitCode, reportPath }).catch((err) => process.stderr.write(`[gate] kanban notify failed: ${err.message}\n`));
  }
  process.stdout.write(`\n[gate] ${passed ? "✓ PASS" : "✗ FAIL"} (exit ${exitCode}) — report: ${reportPath}\n`);
  return { passed, exitCode, stages, reportPath, dir, pending };
}

function runGate(opts = {}) {
  const tag = opts.tag || ts();
  const dir = path.join(RUNS_DIR, `gate-${tag}`);
  ensureDir(dir);
  const stages = [];

  if (!config.deployCommands.length) {
    process.stdout.write("[gate] config.js → deployCommands is empty. Set your build/test commands. Treating as pass.\n");
    return finalize(dir, tag, [{ name: "00-noop", passed: true, status: 0, duration: 0, skipped: true, note: "no deployCommands configured" }], 0);
  }

  let i = 0;
  for (const dc of config.deployCommands) {
    i++;
    const name = dc.name || `${String(i).padStart(2, "0")}-${(dc.cmd || "stage").replace(/[^a-z0-9]+/gi, "")}`;
    const s = runStage(name, dc.cmd, dc.args || [], dir, dc.env || {});
    stages.push(s);
    if (!s.passed) return finalize(dir, tag, stages, i);
  }

  const insp = inspectBundle(dir);
  stages.push(insp);
  let exitCode = 0;
  if (!insp.passed && process.env.STRICT_BUNDLE === "1") exitCode = config.deployCommands.length + 1;
  return finalize(dir, tag, stages, exitCode);
}

function notifyFailure({ tag, dir, branch, stages, exitCode, reportPath }) {
  const failed = stages.find((s) => !s.passed && !s.skipped);
  const stageName = failed ? failed.name : `exit-${exitCode}`;
  const reportRel = path.relative(HARNESS_ROOT, reportPath);
  const stageRows = stages.map((s, i) => `${i + 1}. ${s.name} — ${s.skipped ? "skipped" : s.passed ? "pass" : "FAIL"}${s.warning ? ` (${s.warning})` : ""}${s.note ? ` (${s.note})` : ""}`).join("\n");
  const description = [
    `Gate run **${tag}** blocked the push on branch \`${branch}\`.`,
    "",
    `**Failed stage**: ${stageName} (exit ${exitCode})`,
    `**Report**: ${reportRel}`,
    `**Run dir**: ${path.relative(HARNESS_ROOT, dir)}`,
    "", "## Stages", stageRows,
    "", "Resolve the failed stage, then re-push. To bypass (audited): `KANBAN_GATE_BYPASS=1 git push`.",
  ].join("\n");
  const payload = {
    subject: `[BUILD-FAIL] ${branch}: ${stageName} (gate ${tag})`,
    description, status: "in_review", priority: "high", agent: "deploy-gate-agent",
    reportPath: reportRel, reportSummary: `${stageName} failed (exit ${exitCode})`,
  };
  return postKanban("/api/tasks", payload).then((task) => {
    if (task && task.id) {
      postKanban(`/api/tasks/${task.id}/slack`, { text: `[BLOCKED] deploy-gate-agent: ${payload.subject}. Stage ${stageName} failed. Report: ${reportRel}` }).catch(() => {});
      process.stdout.write(`[gate] kanban task #${task.id} created (status=in_review, priority=high)\n`);
    }
    return task;
  });
}

function postKanban(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: "127.0.0.1", port: KANBAN_PORT, path: pathname, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }, timeout: 4000 }, (res) => {
      let chunks = "";
      res.on("data", (c) => (chunks += c));
      res.on("end", () => { if (res.statusCode >= 200 && res.statusCode < 300) { try { resolve(JSON.parse(chunks)); } catch { resolve(null); } } else reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 200)}`)); });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.write(data); req.end();
  });
}

module.exports = { runGate, inspectBundle };

if (require.main === module) {
  const result = runGate();
  Promise.resolve(result.pending).finally(() => process.exit(result.exitCode));
}
