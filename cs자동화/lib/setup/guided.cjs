/**
 * Guided setup for a public agent-kanban-harness instance.
 *
 * This intentionally sends only a structure summary to Claude/Codex: package
 * scripts, top-level directories, and common config filenames. It never reads
 * source file contents, .env, task history, logs, or local conversation state.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { spawnSync, execSync } = require("child_process");

const RUNNERS = new Set(["claude", "codex", "both", "reviewer:codex", "reviewer:claude"]);
const EVALUATION_LEVELS = new Set(["single-model", "review", "cross-validation"]);
const DEFAULT_GLOBS = {
  frontend: ["src/**", "app/**", "pages/**", "components/**", "styles/**", "public/**"],
  backend: ["server/**", "api/**", "routes/**", "db/**", "migrations/**", "functions/**", "lib/**"],
  test: ["test/**", "tests/**", "e2e/**", "playwright.config.*", "**/*.spec.*", "**/*.test.*"],
  docs: ["docs/**", "README.md", "*.md"],
  deploy: [".github/**", "Dockerfile", "docker-compose*.yml", "vercel.json", "netlify.toml", "fly.toml", "railway.json"],
};

function q(s) { return JSON.stringify(String(s)); }
function safeName(s, fallback = "agent") {
  const out = String(s || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return out || fallback;
}
function which(cmd) {
  try { return execSync(`command -v ${cmd}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}
function exists(root, rel) { return fs.existsSync(path.join(root, rel)); }
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; }
}
function listTop(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => !d.name.startsWith(".") && d.name !== "node_modules")
      .slice(0, 80)
      .map((d) => d.name + (d.isDirectory() ? "/" : ""));
  } catch { return []; }
}
function listGitFiles(root) {
  try {
    const out = execSync("git ls-files", { cwd: root, encoding: "utf-8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
    return out.split(/\r?\n/).filter(Boolean).slice(0, 500);
  } catch {
    return [];
  }
}
function detectPackageManager(root) {
  if (exists(root, "pnpm-lock.yaml")) return "pnpm";
  if (exists(root, "yarn.lock")) return "yarn";
  if (exists(root, "package-lock.json")) return "npm";
  if (exists(root, "bun.lockb") || exists(root, "bun.lock")) return "bun";
  return "npm";
}
function scriptCmd(pm, script) {
  if (pm === "pnpm") return { name: script, cmd: "pnpm", args: ["run", script] };
  if (pm === "yarn") return { name: script, cmd: "yarn", args: [script] };
  if (pm === "bun") return { name: script, cmd: "bun", args: ["run", script] };
  return { name: script, cmd: "npm", args: ["run", script] };
}
function inferDeployCommands(scan) {
  const scripts = scan.packageScripts || {};
  const order = ["lint", "typecheck", "test", "build"];
  return order.filter((s) => scripts[s]).map((s, i) => ({ ...scriptCmd(scan.packageManager, s), name: `${String(i + 1).padStart(2, "0")}-${s}` }));
}
function inferBuildOutputDir(scan) {
  if (scan.keyFiles.includes("next.config.js") || scan.keyFiles.includes("next.config.mjs")) return ".next";
  if (scan.topLevel.includes("dist/")) return "dist";
  if (scan.topLevel.includes("build/")) return "build";
  if (scan.topLevel.includes(".next/")) return ".next";
  return null;
}
function scanRepo(repoPath) {
  const root = path.resolve(repoPath);
  const pkg = readJson(path.join(root, "package.json")) || {};
  const files = listGitFiles(root);
  const topLevel = listTop(root);
  const keyFiles = [
    "package.json", "pnpm-lock.yaml", "yarn.lock", "package-lock.json", "bun.lockb",
    "next.config.js", "next.config.mjs", "vite.config.ts", "vite.config.js",
    "tsconfig.json", "pyproject.toml", "Cargo.toml", "go.mod", "Dockerfile",
    "vercel.json", "netlify.toml", ".github/workflows",
  ].filter((rel) => exists(root, rel));
  const packageManager = detectPackageManager(root);
  const commonDirs = {
    frontend: ["src", "app", "pages", "components", "styles", "public"].filter((d) => exists(root, d)),
    backend: ["server", "api", "routes", "db", "migrations", "functions", "supabase", "lib"].filter((d) => exists(root, d)),
    tests: ["test", "tests", "e2e", "__tests__"].filter((d) => exists(root, d)),
    docs: ["docs", "manual", "playbooks"].filter((d) => exists(root, d)),
    deploy: [".github", "infra", "ops"].filter((d) => exists(root, d)),
  };
  return {
    repoName: path.basename(root),
    repoPath: root,
    packageManager,
    packageScripts: pkg.scripts || {},
    topLevel,
    keyFiles,
    commonDirs,
    sampleFiles: files.filter((f) => !f.includes(".env") && !f.includes("secret") && !f.includes("credential")).slice(0, 120),
  };
}

function defaultPlan(answers, scan) {
  const agents = [
    {
      name: "orchestrator",
      group: "core",
      mission: "Turn operator requests into explicit kanban tasks, route them to the right specialist, and keep the task state machine honest.",
      runner: "claude",
      model_default: "claude-sonnet-4-6",
      owns: [],
      triggers: ["Any new operator request or unassigned task."],
      inputs: ["config.js", "agents/*.md", "kanban tasks", "repo structure summary"],
      outputs: ["routed task with agent, priority, and metadata.runner"],
      crossValidation: "Use specialist runners for implementation and verification; the orchestrator itself does not edit application code.",
      failureHandling: "If ownership is ambiguous, create a needs-human task with the competing owners listed.",
    },
  ];
  if (scan.commonDirs.frontend.length) agents.push({
    name: "frontend-agent",
    group: "core",
    mission: "Keep user-facing UI, routing, and client-side state changes coherent and reviewable.",
    runner: "reviewer:codex",
    model_default: "claude-sonnet-4-6",
    owns: DEFAULT_GLOBS.frontend,
    triggers: ["Tasks touching UI, routes, styles, client state, or browser behavior."],
    inputs: ["UI source files", "routes", "component tests", "screenshots when available"],
    outputs: ["code changes plus a verification note with touched files and UI risk"],
    crossValidation: "Claude implements; Codex reviews for regressions and missing edge cases.",
    failureHandling: "If UI behavior cannot be verified locally, move the task to in_review with exact missing checks.",
  });
  if (scan.commonDirs.backend.length) agents.push({
    name: "backend-agent",
    group: "core",
    mission: "Protect API, data, auth, and server-side contracts from unsafe or unverified changes.",
    runner: "both",
    model_default: "both",
    owns: DEFAULT_GLOBS.backend,
    triggers: ["Tasks touching APIs, database/schema, server functions, auth, or shared libraries."],
    inputs: ["server code", "schema/migration files", "contract tests", "logs supplied by the operator"],
    outputs: ["implementation report, migration notes, and contract verification commands"],
    crossValidation: "Claude and Codex work independently; disagreement stays in_review for a human decision.",
    failureHandling: "Never mark completed when write paths or migrations were not exercised.",
  });
  if (scan.commonDirs.tests.length || Object.keys(scan.packageScripts).some((s) => /test|e2e|playwright|vitest|jest/i.test(s))) agents.push({
    name: "qa-agent",
    group: "core",
    mission: "Turn risky changes into runnable checks and keep test evidence attached to tasks.",
    runner: "codex",
    model_default: "gpt-5.4",
    owns: DEFAULT_GLOBS.test,
    triggers: ["Regression reports, flaky tests, missing coverage, or release-gate failures."],
    inputs: ["test files", "test command output", "changed file list"],
    outputs: ["focused test changes or a concise verification report"],
    crossValidation: "Use reviewer:codex or both when the test itself encodes business-critical behavior.",
    failureHandling: "If a test cannot run, report the exact command and blocker.",
  });
  agents.push({
    name: "deploy-gate-agent",
    group: "core",
    mission: "Block releases until configured build, test, and smoke commands pass from the target repo.",
    runner: "reviewer:codex",
    model_default: "claude-sonnet-4-6",
    owns: DEFAULT_GLOBS.deploy,
    triggers: ["Pre-push hook, release request, deployment failure, or gate failure."],
    inputs: ["config.js deployCommands", "CI/deploy config", "gate output"],
    outputs: ["pass/fail release verdict with failing command and next action"],
    crossValidation: "Codex reviews release-risk reasoning before human-visible pass claims.",
    failureHandling: "Gate failure creates or updates an in_review task and does not deploy.",
  });
  if (scan.commonDirs.docs.length) agents.push({
    name: "docs-agent",
    group: "core",
    mission: "Keep project instructions, runbooks, and handoff documents accurate after code or process changes.",
    runner: "claude",
    model_default: "claude-sonnet-4-6",
    owns: DEFAULT_GLOBS.docs,
    triggers: ["New workflows, architecture changes, onboarding changes, or repeated operator questions."],
    inputs: ["README", "docs", "playbooks", "task reports"],
    outputs: ["doc patch or handoff note"],
    crossValidation: "Use Codex review for docs that encode release or security procedure.",
    failureHandling: "If source-of-truth is unclear, leave an explicit open question instead of inventing procedure.",
  });
  return {
    projectName: answers.projectName || scan.repoName,
    repoPath: scan.repoPath,
    goldenDir: answers.goldenDir || "golden/",
    evaluationLevel: normalizeEvaluationLevel(answers.evaluationLevel),
    boardDir: safeName(answers.boardDir || scan.repoName || "kanban"),
    kanbanPort: Number(answers.port || 8080),
    goal: typeof answers.goal === "string" ? answers.goal : "",
    deployCommands: inferDeployCommands(scan),
    buildOutputDir: inferBuildOutputDir(scan),
    agents,
  };
}
function normalizeEvaluationLevel(value) {
  const v = String(value || "").trim().toLowerCase();
  if (EVALUATION_LEVELS.has(v)) return v;
  if (v === "single" || v === "single model" || v === "1") return "single-model";
  if (v === "cross" || v === "cross validation" || v === "3") return "cross-validation";
  if (v === "2") return "review";
  return "review";
}
function applyEvaluationLevel(plan) {
  const level = normalizeEvaluationLevel(plan.evaluationLevel);
  const agents = plan.agents.map((agent) => {
    if (agent.name === "orchestrator") return { ...agent, runner: "claude" };
    if (level === "single-model") return { ...agent, runner: agent.runner === "codex" ? "codex" : "claude" };
    if (level === "cross-validation") return { ...agent, runner: "both" };
    if (agent.runner === "both") return agent;
    return { ...agent, runner: "reviewer:codex" };
  });
  return { ...plan, evaluationLevel: level, agents };
}
function applyAgentSelection(plan, selection) {
  const raw = String(selection || "").trim();
  if (!raw || /^기본|default|all$/i.test(raw)) return { plan, custom: [] };
  const wanted = raw.split(/[,，\s]+/).map((s) => safeName(s)).filter(Boolean);
  const byName = new Map(plan.agents.map((a) => [a.name, a]));
  const agents = [byName.get("orchestrator") || plan.agents[0]].filter(Boolean);
  const custom = [];
  for (const name of wanted) {
    if (name === "orchestrator") continue;
    if (byName.has(name)) agents.push(byName.get(name));
    else {
      custom.push(name);
      agents.push(normalizeAgent({
        name,
        group: "domain",
        mission: `${name} 영역의 작업을 Skill File 5단계에 맞춰 수행한다.`,
        runner: plan.evaluationLevel === "cross-validation" ? "both" : plan.evaluationLevel === "single-model" ? "claude" : "reviewer:codex",
        owns: [],
        triggers: ["칸반 task에서 이 specialist agent가 지정된다."],
        inputs: ["CLAUDE.md", "config.js", "golden/"],
        outputs: ["변경 파일 목록, 검증 결과, reportSummary"],
        crossValidation: "평가 루프 레벨 설정을 따른다.",
        failureHandling: "역할이 부족하면 agents/_TEMPLATE.md를 복사해 Skill File 5단계를 채운다.",
      }, agents.length));
    }
  }
  return { plan: { ...plan, agents }, custom };
}

function buildQuestionPrompt(scan) {
  return [
    "You are configuring a local kanban multi-agent harness for a user's project.",
    "Do not ask for secrets. Do not ask for source code. Use only this sanitized repo summary.",
    "",
    "Return JSON only:",
    "{ \"questions\": [\"short question 1\", \"short question 2\", \"short question 3\"] }",
    "",
    "Repo summary:",
    JSON.stringify(sanitizeScan(scan), null, 2),
  ].join("\n");
}
function buildPlanPrompt(scan, answers, extraAnswers) {
  return [
    "Create a safe agent-kanban-harness configuration plan for this project.",
    "Use only the sanitized repo summary and the operator answers. Do not include secrets, local user names, or private data.",
    "Return JSON only with this shape:",
    "{ \"projectName\": string, \"goal\": string, \"boardDir\": string, \"kanbanPort\": number, \"deployCommands\": [{\"name\": string, \"cmd\": string, \"args\": string[]}], \"buildOutputDir\": string|null, \"agents\": [{\"name\": string, \"group\": \"core|domain\", \"mission\": string, \"runner\": \"claude|codex|both|reviewer:codex|reviewer:claude\", \"model_default\": string, \"owns\": string[], \"triggers\": string[], \"inputs\": string[], \"outputs\": string[], \"crossValidation\": string, \"failureHandling\": string}] }",
    "",
    "Repo summary:",
    JSON.stringify(sanitizeScan(scan), null, 2),
    "",
    "Base answers:",
    JSON.stringify(answers, null, 2),
    "",
    "Assistant interview answers:",
    JSON.stringify(extraAnswers, null, 2),
  ].join("\n");
}
function sanitizeScan(scan) {
  return {
    repoName: scan.repoName,
    packageManager: scan.packageManager,
    packageScripts: scan.packageScripts,
    topLevel: scan.topLevel,
    keyFiles: scan.keyFiles,
    commonDirs: scan.commonDirs,
    sampleFiles: scan.sampleFiles,
  };
}
function callAssistant(kind, prompt, cwd) {
  if (kind === "none") return "";
  const chosen = kind === "auto" ? (which("claude") ? "claude" : which("codex") ? "codex" : "none") : kind;
  if (chosen === "none") return "";
  let r;
  if (chosen === "claude") {
    r = spawnSync("claude", ["-p", "--output-format", "text", "--model", "sonnet", "--no-session-persistence"], {
      cwd, input: prompt, encoding: "utf-8", timeout: 180000, env: { ...process.env, FORCE_COLOR: "0" },
    });
  } else if (chosen === "codex") {
    r = spawnSync("codex", ["exec", "-"], {
      cwd, input: prompt, encoding: "utf-8", timeout: 180000, env: { ...process.env, FORCE_COLOR: "0" },
    });
  } else {
    return "";
  }
  if (r.error || r.status !== 0) return "";
  return r.stdout || "";
}
function parseJsonLoose(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const first = text.indexOf("{"), last = text.lastIndexOf("}");
  if (first >= 0 && last > first) { try { return JSON.parse(text.slice(first, last + 1)); } catch {} }
  return null;
}
function normalizePlan(raw, fallback, scan) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = { ...fallback };
  if (typeof src.projectName === "string" && src.projectName.trim()) out.projectName = src.projectName.trim();
  if (typeof src.goal === "string") out.goal = src.goal.trim();
  if (typeof src.boardDir === "string" && src.boardDir.trim()) out.boardDir = safeName(src.boardDir, fallback.boardDir);
  if (Number.isFinite(Number(src.kanbanPort))) out.kanbanPort = Number(src.kanbanPort);
  if (Array.isArray(src.deployCommands)) out.deployCommands = src.deployCommands.filter(validCommand).slice(0, 8);
  if (src.buildOutputDir === null || typeof src.buildOutputDir === "string") out.buildOutputDir = src.buildOutputDir || null;
  if (Array.isArray(src.agents) && src.agents.length) {
    const agents = src.agents.map((a, i) => normalizeAgent(a, i)).filter(Boolean);
    if (agents.length && !agents.some((a) => a.name === "orchestrator")) agents.unshift(fallback.agents[0]);
    if (agents.length) out.agents = agents;
  }
  if (!out.deployCommands.length) out.deployCommands = inferDeployCommands(scan);
  return out;
}
function validCommand(c) {
  return c && typeof c.name === "string" && typeof c.cmd === "string" && Array.isArray(c.args) && c.args.every((a) => typeof a === "string");
}
function normalizeAgent(a, i) {
  if (!a || typeof a !== "object") return null;
  const name = safeName(a.name, `agent-${i + 1}`);
  const runner = RUNNERS.has(a.runner) ? a.runner : "claude";
  const owns = Array.isArray(a.owns) ? a.owns.filter((g) => typeof g === "string" && g.trim() && !g.includes("..")).slice(0, 20) : [];
  return {
    name,
    group: a.group === "domain" ? "domain" : "core",
    mission: String(a.mission || `Own ${name} tasks.`).trim(),
    runner,
    model_default: String(a.model_default || (runner.includes("codex") ? "gpt-5.4" : "claude-sonnet-4-6")).trim(),
    owns,
    triggers: asLines(a.triggers),
    inputs: asLines(a.inputs),
    outputs: asLines(a.outputs),
    crossValidation: String(a.crossValidation || "Use the configured runner policy; escalate disagreements to in_review.").trim(),
    failureHandling: String(a.failureHandling || "If blocked, record the exact command, file, or decision needed and move to in_review.").trim(),
  };
}
function asLines(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 10);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return ["Operator-created kanban task."];
}

async function runGuidedSetup(opts = {}) {
  const cwd = path.resolve(opts.cwd || process.cwd());
  const cli = { claude: !!which("claude"), codex: !!which("codex") };
  const yes = !!opts.yes;
  console.log("");
  console.log("AI 하네스 6주 완주반 3주차+ setup --guided");
  console.log("하네스 = AI를 묶어두는 고삐 = 설계+파일+절차의 묶음입니다.");
  console.log("아래 5가지만 정하면 보드가 프로젝트를 운전할 준비를 합니다.");
  console.log("");
  const repoPath = path.resolve(opts.repoPath || (yes ? cwd : await ask("1) 이 하네스가 운전할 프로젝트 절대경로(repoPath)", cwd)));
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) throw new Error(`repo path not found: ${repoPath}`);
  const scan = scanRepo(repoPath);
  const answers = {
    projectName: scan.repoName,
    boardDir: safeName(scan.repoName),
    port: "8080",
    goldenDir: yes ? "golden/" : await ask("2) 골든 데이터 위치(golden/ 폴더, 없으면 비워둠 - 나중에 등록)", "golden/"),
    evaluationLevel: "review",
    goal: "",
  };
  const assistant = opts.assistant || "auto";
  let selection = "기본";
  const initialFallback = defaultPlan(answers, scan);
  if (!yes) {
    const names = initialFallback.agents.filter((a) => a.name !== "orchestrator").map((a) => a.name).join(", ");
    selection = await ask("3) 에이전트 구성(필요한 specialist agent 이름을 쉼표로 선택, 부족하면 _TEMPLATE로 직접 작성)", names || "frontend-agent, backend-agent, deploy-gate-agent");
    answers.evaluationLevel = await ask("4) 평가 루프 레벨(single-model / review / cross-validation)", "review");
    answers.goal = await ask("5) 이 프로젝트의 목표(goal) — 6주 후 무엇을 달성하나", "6주 후 — 주간 보고서 자동 생성 자동화 1개 완성");
  }
  console.log("");
  console.log(`Repo scan: ${scan.repoName} · ${scan.packageManager} · scripts=${Object.keys(scan.packageScripts).join(", ") || "none"}`);
  console.log(`Local CLIs: Claude=${cli.claude ? "found" : "missing"} · Codex=${cli.codex ? "found" : "missing"}`);
  console.log(`Assistant mode: ${assistant}`);

  const fallback = defaultPlan(answers, scan);
  let plan = fallback;
  if (assistant !== "none" && (cli.claude || cli.codex)) {
    const raw = parseJsonLoose(callAssistant(assistant, buildPlanPrompt(scan, answers, { agentSelection: selection }), repoPath));
    plan = normalizePlan(raw, fallback, scan);
  }
  plan.goldenDir = answers.goldenDir || "golden/";
  plan.goal = typeof answers.goal === "string" ? answers.goal : (plan.goal || "");
  plan.evaluationLevel = normalizeEvaluationLevel(answers.evaluationLevel);
  plan = applyEvaluationLevel(plan);
  const selected = applyAgentSelection(plan, selection);
  plan = selected.plan;

  writePlan(cwd, plan, scan, { force: !!opts.force, dryRun: !!opts.dryRun });
  console.log("");
  console.log(`✓ guided setup ${opts.dryRun ? "planned" : "wrote"} ${plan.agents.length} agents for ${plan.projectName}`);
  console.log(`  config.js → repoPath=${repoPath}`);
  console.log(`  목표(goal) → ${plan.goal || "(비어 있음)"}`);
  console.log(`  골든 데이터 → ${plan.goldenDir || "(나중에 등록)"}`);
  console.log(`  평가 루프 → ${plan.evaluationLevel}`);
  console.log(`  runners: ${[...new Set(plan.agents.map((a) => a.runner))].join(", ")}`);
  if (selected.custom.length) console.log(`  직접 보강 필요: ${selected.custom.join(", ")} — agents/_TEMPLATE.md의 Skill File 5단계로 채우세요.`);
  console.log("");
  console.log("Next:");
  console.log(`  npm start  # → http://localhost:${plan.kanbanPort}`);
  console.log("  npx agent-kanban-harness doctor");
  console.log("  # 코어(보드·init·setup·gate)는 npm install 없이 동작");
  console.log("  # Slack/Telegram 미러를 쓸 때만 board 폴더에서 npm install 1회");
}

function renderConfig(plan) {
  const agents = plan.agents.map((a) => ({
    name: a.name,
    def: `agents/${a.name}.md`,
    runner: a.runner,
    ...(a.owns && a.owns.length ? { owns: a.owns } : {}),
  }));
  return `/**
 * Local agent-kanban-harness config generated by guided setup.
 *
 * This file is intentionally gitignored. Keep local paths and private
 * operational choices here; publish only config.example.js.
 */
module.exports = {
  projectName: ${q(plan.projectName)},
  goal: ${q(plan.goal || "")},
  repoPath: ${q(plan.repoPath)},
  goldenDir: ${q(plan.goldenDir || "golden/")},
  evaluationLevel: ${q(normalizeEvaluationLevel(plan.evaluationLevel))},
  kanbanPort: ${Number(plan.kanbanPort) || 8080},
  boardDir: ${q(plan.boardDir || "kanban")},
  deployCommands: ${JSON.stringify(plan.deployCommands || [], null, 2).replace(/^/gm, "  ").trim()},
  buildOutputDir: ${plan.buildOutputDir ? q(plan.buildOutputDir) : "null"},
  agents: ${JSON.stringify(agents, null, 2).replace(/^/gm, "  ").trim()},
  detectors: [],
  slack: { command: "/kanban" },
  telegram: { pollEnabled: true, pollIntervalMs: 1500 },
};
`;
}
function renderAgent(agent) {
  return `---
name: ${agent.name}
group: ${agent.group || "core"}
mission: >-
  ${agent.mission}
runner: ${agent.runner}
model_default: ${agent.model_default}
tools_allowed: [Read, Edit, Bash]
worktree: isolated
escalation: human
${agent.owns && agent.owns.length ? `owns:\n${agent.owns.map((g) => `  - ${g}`).join("\n")}` : "owns: []"}
---

# ${titleCase(agent.name)}

${agent.mission}

## Triggers
${agent.triggers.map((x) => `- ${x}`).join("\n")}

## Inputs
${agent.inputs.map((x) => `- ${x}`).join("\n")}

## Outputs
${agent.outputs.map((x) => `- ${x}`).join("\n")}

## Cross-validation policy
${agent.crossValidation}

## Failure handling
${agent.failureHandling}

## Hard rules
- Work only inside this agent's ownership unless the task explicitly routes a handoff.
- Do not commit or print secrets, .env values, private task history, or personal paths.
- Finish with exact files changed and verification commands run.
`;
}
function titleCase(slug) {
  return slug.split(/[-_]/).filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1)).join(" ");
}
// 작업 대상 repo(repoPath)에 심는 Kanban-First 규칙 블록. Claude Code / Codex 는
// 작업 디렉토리의 CLAUDE.md 를 자동 컨텍스트로 읽으므로, 규칙을 작업 위치에도
// 두어야 "하네스 밖에서 작업할 때 규칙이 안 잡히는" 문제를 막을 수 있다.
const REPO_RULE_BEGIN = "<!-- agent-kanban-harness:kanban-rule:begin -->";
const REPO_RULE_END = "<!-- agent-kanban-harness:kanban-rule:end -->";

function renderRepoRule(plan) {
  const port = Number(plan.kanbanPort) || 8080;
  return `${REPO_RULE_BEGIN}
# agent-kanban-harness — 이 저장소의 절대 운영 규칙

이 저장소는 agent-kanban-harness 칸반 보드(http://localhost:${port})가 운전하는
대상 프로젝트입니다. Claude Code / Codex 로 이 저장소에서 작업할 때 아래 규칙을
예외 없이 따릅니다.

## 모든 작업은 칸반 카드부터 — 예외 없음

이 저장소에서 수행하는 **모든 작업**(코드 작성·파일 생성·리팩터·에이전트 세팅
등 무엇이든)은 시작 전에 반드시 칸반 보드에 task(카드)로 등록해야 합니다.

1. 사용자 지시를 받으면 먼저 \`POST http://localhost:${port}/api/tasks\` —
   \`{ subject, description, agent, priority }\`. description 에 지시를 그대로 적는다.
2. task 를 \`in_progress\` 로 옮긴 뒤에야 실제 작업을 시작한다.
3. 작업이 끝나면 \`reportSummary\` 를 남기고 \`completed\` 로 옮긴다.

카드 없이 시작한 작업은 규칙 위반입니다. "간단해서" "사용자가 바로 해달라고
해서"는 예외가 아닙니다. 칸반 카드가 곧 작업의 시작점입니다.
하네스 = AI를 묶어두는 고삐 — 이 규칙이 고삐의 첫 매듭입니다.
${REPO_RULE_END}`;
}

// repoPath 의 CLAUDE.md 에 규칙 블록을 심는다(idempotent). 하네스 디렉토리(cwd)와
// 같으면 건너뛴다 — 하네스 자체 CLAUDE.md 는 따로 관리된다.
function writeRepoRule(repoPath, cwd, plan, dryRun) {
  if (path.resolve(repoPath) === path.resolve(cwd)) return;
  const target = path.join(repoPath, "CLAUDE.md");
  if (dryRun) { console.log(`[dry-run] would write Kanban-First rule into ${target}`); return; }
  const block = renderRepoRule(plan);
  let next;
  if (fs.existsSync(target)) {
    const cur = fs.readFileSync(target, "utf-8");
    const b = cur.indexOf(REPO_RULE_BEGIN);
    const e = cur.indexOf(REPO_RULE_END);
    if (b !== -1 && e !== -1) {
      next = cur.slice(0, b) + block + cur.slice(e + REPO_RULE_END.length);
    } else {
      next = block + "\n\n" + cur;
    }
  } else {
    next = block + "\n";
  }
  fs.writeFileSync(target, next);
  console.log(`✓ Kanban-First 규칙을 작업 repo 에 심었습니다: ${target}`);
}

function writePlan(cwd, plan, scan, opts = {}) {
  const agentsDir = path.join(cwd, "agents");
  const configPath = path.join(cwd, "config.js");
  if (!opts.force && fs.existsSync(configPath) && !opts.dryRun) {
    throw new Error("config.js already exists. Re-run with --force to overwrite.");
  }
  const files = [
    { path: configPath, body: renderConfig({ ...plan, repoPath: scan.repoPath }) },
    ...plan.agents.map((a) => ({ path: path.join(agentsDir, `${a.name}.md`), body: renderAgent(a) })),
  ];
  if (opts.dryRun) {
    for (const f of files) console.log(`[dry-run] would write ${f.path}`);
    writeRepoRule(scan.repoPath, cwd, plan, true);
    return;
  }
  fs.mkdirSync(agentsDir, { recursive: true });
  for (const f of files) fs.writeFileSync(f.path, f.body);
  writeRepoRule(scan.repoPath, cwd, plan, false);
}
async function ask(question, def) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = def ? ` (${def})` : "";
  const answer = await new Promise((resolve) => rl.question(`${question}${suffix}: `, resolve));
  rl.close();
  return answer.trim() || def;
}

async function runDoctor(opts = {}) {
  const cwd = path.resolve(opts.cwd || process.cwd());
  const checks = [];
  const add = (ok, name, detail) => checks.push({ ok, name, detail });
  add(!!which("node"), "node on PATH", process.version);
  add(!!which("claude"), "claude CLI on PATH", which("claude") || "not found");
  add(!!which("codex"), "codex CLI on PATH", which("codex") || "not found");
  add(fs.existsSync(path.join(cwd, "config.js")), "config.js exists", path.join(cwd, "config.js"));
  add(fs.existsSync(path.join(cwd, "agents")), "agents directory exists", path.join(cwd, "agents"));
  const gitignore = fs.existsSync(path.join(cwd, ".gitignore")) ? fs.readFileSync(path.join(cwd, ".gitignore"), "utf-8") : "";
  add(gitignore.includes(".env"), ".env is gitignored", ".gitignore contains .env");
  add(gitignore.includes("config.js"), "config.js is gitignored", ".gitignore contains config.js");
  const suspect = scanPublicRisk(cwd);
  add(!suspect.length, "no obvious private files in project root", suspect.length ? suspect.join(", ") : "ok");
  for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? " — " + c.detail : ""}`);
  return checks.every((c) => c.ok);
}
function scanPublicRisk(cwd) {
  const names = [".env", ".dashboard-out", "snapshot.json", "ops-thread.jsonl", "activity.jsonl"];
  return names.filter((n) => fs.existsSync(path.join(cwd, n)));
}

module.exports = { runGuidedSetup, runDoctor, scanRepo, defaultPlan };
