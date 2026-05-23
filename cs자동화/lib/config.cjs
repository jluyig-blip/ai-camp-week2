#!/usr/bin/env node
/**
 * agent-kanban-harness config loader.
 *
 * Resolution order:
 *   1. <repo-root>/config.js          (your edited copy — gitignored)
 *   2. <repo-root>/config.example.js  (template fallback, so the server boots)
 *   3. env-var overrides on top of whatever loaded
 *
 * Also loads <repo-root>/.env (without a dependency) so launchd / cron — which
 * don't source your shell — still see SLACK_*, SENTRY_*, etc.
 *
 * `require("../lib/config.cjs")` from anywhere in the repo returns the merged
 * config object. The repo root is the parent of lib/.
 */
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");

// ── Load <repo-root>/.env without external deps ──────────────────────────────
(function loadDotEnv() {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (let line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") process.env[key] = val;
  }
})();

// ── Load config.js (or fall back to config.example.js) ───────────────────────
function loadProjectConfig() {
  const realPath = path.join(REPO_ROOT, "config.js");
  const examplePath = path.join(REPO_ROOT, "config.example.js");
  let cfg = {};
  let source = null;
  if (fs.existsSync(realPath)) {
    cfg = require(realPath);
    source = realPath;
  } else if (fs.existsSync(examplePath)) {
    cfg = require(examplePath);
    source = examplePath;
    if (!process.env.KANBAN_QUIET_CONFIG) {
      console.warn("[config] config.js not found — using config.example.js. Copy it: cp config.example.js config.js");
    }
  }
  return { cfg: cfg || {}, source };
}

const { cfg, source } = loadProjectConfig();

// ── Env-var overrides ────────────────────────────────────────────────────────
const port =
  (process.env.PORT && parseInt(process.env.PORT, 10)) ||
  cfg.kanbanPort ||
  8080;

const slack = Object.assign(
  {
    botToken: "",
    appToken: "",
    channelId: "",
    webhookUrl: "",
    adminUsers: [],
    command: "/kanban",
  },
  cfg.slack || {},
);
if (process.env.SLACK_BOT_TOKEN) slack.botToken = process.env.SLACK_BOT_TOKEN;
if (process.env.SLACK_APP_TOKEN) slack.appToken = process.env.SLACK_APP_TOKEN;
if (process.env.SLACK_CHANNEL_ID) slack.channelId = process.env.SLACK_CHANNEL_ID;
if (process.env.SLACK_AGENT_WEBHOOK) slack.webhookUrl = process.env.SLACK_AGENT_WEBHOOK;
if (process.env.SLACK_ADMIN_USERS) slack.adminUsers = process.env.SLACK_ADMIN_USERS.split(",").filter(Boolean);
if (process.env.SLACK_COMMAND) slack.command = process.env.SLACK_COMMAND;

// ── Telegram (optional — Ops Thread mirror panel) ────────────────────────────
// Drop in TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID and the kanban server starts
// mirroring the Ops Thread panel to that Telegram chat (and pulls operator
// replies back via getUpdates polling). Both blank ⇒ panel still works locally
// as a kanban-only chat; it just doesn't sync with Telegram.
const telegram = Object.assign(
  {
    botToken: "",          // BotFather → token
    chatId: "",            // DM chat id (run /api/telegram/whoami → "send any DM to your bot, then GET /api/telegram/whoami")
    allowedChatIds: [],    // optional allowlist; empty ⇒ chatId only
    pollEnabled: true,     // start the long-poll worker on boot when token+chatId present
    pollIntervalMs: 1500,  // gap between long-poll cycles (long-poll itself blocks 25s)
  },
  cfg.telegram || {},
);
if (process.env.TELEGRAM_BOT_TOKEN) telegram.botToken = process.env.TELEGRAM_BOT_TOKEN;
if (process.env.TELEGRAM_CHAT_ID) telegram.chatId = process.env.TELEGRAM_CHAT_ID;
if (process.env.TELEGRAM_ALLOWED_CHAT_IDS) telegram.allowedChatIds = process.env.TELEGRAM_ALLOWED_CHAT_IDS.split(",").map((s) => s.trim()).filter(Boolean);
if (process.env.TELEGRAM_POLL_ENABLED) telegram.pollEnabled = process.env.TELEGRAM_POLL_ENABLED !== "0";
if (process.env.TELEGRAM_POLL_INTERVAL_MS) telegram.pollIntervalMs = parseInt(process.env.TELEGRAM_POLL_INTERVAL_MS, 10);

const config = {
  repoRoot: REPO_ROOT,
  configSource: source,
  projectName: cfg.projectName || path.basename(cfg.repoPath || REPO_ROOT),
  goal: typeof cfg.goal === "string" ? cfg.goal : "",
  // Absolute path to the application repo this harness drives. Defaults to the
  // harness repo itself if unset (so demos work), but you should set it.
  repoPath: cfg.repoPath ? path.resolve(cfg.repoPath) : REPO_ROOT,
  goldenDir: cfg.goldenDir || "golden/",
  evaluationLevel: cfg.evaluationLevel || "review",
  port,
  // Sub-directory under the tasks dir (KANBAN_TASKS_DIR, default ~/.claude/tasks)
  // that holds THIS board's task JSON files. When unset, server/kanban.cjs derives
  // it from the harness directory name and finally falls back to "kanban". Each
  // board on a shared tasks dir should have a distinct boardDir so they don't
  // read/write/watch each other's files.
  boardDir: typeof cfg.boardDir === "string" && cfg.boardDir.trim() ? cfg.boardDir.trim() : null,
  // Optional meta-board read-only aggregate mode: an array of board-dir names
  // (e.g. ["kanban","camp-lms"]) under the tasks dir whose tasks this board
  // *displays* together. Reads only — writes still target this board's own
  // boardDir. Duplicate ids across dirs are deduped (first dir in the list wins).
  // null ⇒ ordinary single-board mode. A meta/orchestrator board can set this
  // to the list of area board dirs it should display.
  aggregateDirs: Array.isArray(cfg.aggregateDirs) && cfg.aggregateDirs.length ? cfg.aggregateDirs.slice() : null,
  deployCommands: cfg.deployCommands || [],
  buildOutputDir: cfg.buildOutputDir || null,
  agents: cfg.agents || [],
  detectors: cfg.detectors || [],
  // Area ID this board owns (e.g. "01", "02a"). Used by the auto-pickup loop to
  // claim only this area's pending tasks. null ⇒ no area filter (claims any).
  area: cfg.area || null,
  // When true, the kanban server runs a 20s loop that picks the highest-priority
  // pending task for this area and flips it to in_progress (which triggers the
  // auto-executor). One at a time; skipped while something is already executing.
  autoPickup: cfg.autoPickup === true,
  // When true, this board never auto-executes (no spawn-on-in_progress, no
  // auto-pickup). For orchestration-only boards where work is started
  // deliberately by an operator / a higher-level process, not fire-and-forget.
  manualOnly: cfg.manualOnly === true,
  gateTimeoutMs: parseInt(process.env.GATE_TIMEOUT_MS || "600000", 10),
  slack,
  telegram,
};

module.exports = config;

// Allow `node lib/config.cjs` to print the resolved config.
if (require.main === module) {
  const redacted = JSON.parse(JSON.stringify(config));
  redacted.slack = {
    ...redacted.slack,
    botToken: redacted.slack.botToken ? "(set)" : "",
    appToken: redacted.slack.appToken ? "(set)" : "",
    webhookUrl: redacted.slack.webhookUrl ? "(set)" : "",
  };
  redacted.telegram = {
    ...redacted.telegram,
    botToken: redacted.telegram.botToken ? "(set)" : "",
  };
  console.log(JSON.stringify(redacted, null, 2));
}
