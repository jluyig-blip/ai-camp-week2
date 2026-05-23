#!/usr/bin/env node
/**
 * agent-kanban-harness — real-time multi-agent kanban dashboard + REST API.
 *
 *   ~/.claude/tasks/  →  file watch  →  SSE  →  browser auto-update
 *   POST/PUT/DELETE /api/tasks       →  server-side CRUD
 *   /api/agents                      →  agent registry (from agents/*.md)
 *   /events                          →  SSE stream
 *
 * Config comes from <repo-root>/config.js (see config.example.js).
 * Tasks live under ~/.claude/tasks/<boardDir>/.
 *
 * Run:  npm start   (or  node server/kanban.cjs)
 */

const config = require("../lib/config.cjs");

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, spawn } = require("child_process");

const PORT = config.port;
const PROJECT_NAME = config.projectName;
const REPO_PATH = config.repoPath;          // the application repo this harness drives
const HARNESS_ROOT = config.repoRoot;       // this agent-kanban-harness checkout
const INSTALLED_VERSION = (() => {
  try { return require(path.join(HARNESS_ROOT, "package.json")).version || null; }
  catch { return null; }
})();
// The tasks dir. Overridable via KANBAN_TASKS_DIR (tests / throwaway dirs).
const TASKS_DIR = process.env.KANBAN_TASKS_DIR || path.join(os.homedir(), ".claude", "tasks");
// THIS board's own scope: every read/write/watch this server does is confined to
// BOARD_DIR. No more scanning every child of TASKS_DIR (the multi-board fan-out
// + duplicate-id runaway). Explicit config.boardDir wins; otherwise a scaffolded
// board defaults to its harness directory name, with "kanban" as a final fallback.
const BOARD_NAME = config.boardDir || path.basename(HARNESS_ROOT) || "kanban";
const BOARD_DIR = path.join(TASKS_DIR, BOARD_NAME);
// Optional meta-board read-only aggregate: a list of board-dir names under
// TASKS_DIR whose tasks this board *displays* together (deduped by id). Writes
// still go to BOARD_DIR only. null ⇒ ordinary single-board mode.
const AGGREGATE_DIRS = Array.isArray(config.aggregateDirs) && config.aggregateDirs.length ? config.aggregateDirs.slice() : null;
// Names under TASKS_DIR that are never task dirs (data / archives / project meta).
const NON_BOARD_NAMES = new Set(["data", "_archives", "_archive", "archives", "_projects.json", "node_modules"]);
const ACTIVITY_FILE = path.join(TASKS_DIR, "activity.jsonl");
// Back-compat alias — historically KANBAN_DIR; now BOARD_DIR (this board's own).
const KANBAN_DIR = BOARD_DIR;

if (!fs.existsSync(BOARD_DIR)) fs.mkdirSync(BOARD_DIR, { recursive: true });

// ── Atomic write + per-task lock helpers (multi-writer safety) ───────────────
// Write task JSON via temp-file + rename so a concurrent reader never sees a
// half-written file and two writers can't interleave bytes.
function writeTaskFileAtomic(filePath, obj) {
  const tmp = filePath + ".tmp." + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, filePath);
}
// Cross-process lock around a read-modify-write on one task file. mkdir is
// atomic; busy-wait on contention (holds are sub-ms). Gives up after ~1.5s and
// proceeds anyway (better a rare clobber than a hang).
function withTaskLock(filePath, fn) {
  const lock = filePath + ".lock";
  for (let i = 0; i < 60; i++) {
    try {
      fs.mkdirSync(lock);
      try { return fn(); }
      finally { try { fs.rmdirSync(lock); } catch {} }
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const t = Date.now() + 25;
      while (Date.now() < t) { /* busy-wait ~25ms */ }
    }
  }
  console.error("[lock] gave up on " + filePath);
  return fn();
}
// On startup, sweep stale *.lock dirs (older than ~10s) under BOARD_DIR — a
// crashed board could leave one behind.
function sweepStaleLocks() {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(BOARD_DIR)) {
      if (!f.endsWith(".lock")) continue;
      const p = path.join(BOARD_DIR, f);
      try { const st = fs.statSync(p); if (st.isDirectory() && (now - st.mtimeMs) > 10000) fs.rmdirSync(p); } catch {}
    }
  } catch {}
}
// A pid is "alive" if process.kill(pid, 0) doesn't throw ESRCH.
function pidAlive(pid) {
  if (!pid || pid === process.pid) return pid === process.pid;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

const OPS_THREAD_FILE = path.join(TASKS_DIR, "data", "ops-thread.jsonl");
const TELEGRAM_OFFSET_FILE = path.join(TASKS_DIR, "data", "telegram-offset.json");

const SLACK_WEBHOOK = config.slack.webhookUrl;
const SLACK_BOT_TOKEN = config.slack.botToken;
const SLACK_APP_TOKEN = config.slack.appToken;
const SLACK_CHANNEL_ID = config.slack.channelId;
const SLACK_ADMIN_USERS = config.slack.adminUsers;
const SLACK_COMMAND = config.slack.command;
let slackApp = null;
let slackAskActive = false;

// ── Orchestrator chat prompt (optional, drives the in-UI chat panel) ─────────
const ORCHESTRATOR_FILE = path.join(os.homedir(), ".claude", "orchestrator.md");
const ORCHESTRATOR_LOG = path.join(os.homedir(), ".claude", "orchestrator-history.jsonl");

function readOrchestratorPrompt() {
  try { return fs.readFileSync(ORCHESTRATOR_FILE, "utf-8"); } catch { return ""; }
}
function readOrchestratorHistory(limit) {
  if (!fs.existsSync(ORCHESTRATOR_LOG)) return "";
  try {
    const lines = fs.readFileSync(ORCHESTRATOR_LOG, "utf-8").trim().split("\n").filter(Boolean);
    return lines.slice(-1 * (limit || 10)).map((line) => {
      try { const e = JSON.parse(line); return "[" + e.ts + "] " + (e.role || "system") + ": " + e.content; }
      catch { return ""; }
    }).filter(Boolean).join("\n");
  } catch { return ""; }
}
function appendOrchestratorHistory(role, content) {
  const entry = { ts: new Date().toISOString(), role, content: content.slice(0, 500) };
  try { fs.appendFileSync(ORCHESTRATOR_LOG, JSON.stringify(entry) + "\n"); } catch {}
  try {
    const lines = fs.readFileSync(ORCHESTRATOR_LOG, "utf-8").trim().split("\n");
    if (lines.length > 600) fs.writeFileSync(ORCHESTRATOR_LOG, lines.slice(-500).join("\n") + "\n");
  } catch {}
}
function extractAndSaveLearnings(text) {
  const regex = /<!--\s*LEARN:\s*(.*?)\s*-->/g;
  let match; const learnings = [];
  while ((match = regex.exec(text)) !== null) learnings.push(match[1].trim());
  if (!learnings.length) return;
  try {
    let content = fs.readFileSync(ORCHESTRATOR_FILE, "utf-8");
    const marker = "## Learnings";
    const idx = content.indexOf(marker);
    if (idx >= 0) {
      const ts = new Date().toISOString().slice(0, 10);
      const additions = learnings.map((l) => "- [" + ts + "] " + l).join("\n");
      let insertPos = content.indexOf("\n", idx + marker.length);
      if (insertPos < 0) insertPos = content.length;
      let afterMarker = content.indexOf("\n", insertPos + 1);
      if (afterMarker < 0) afterMarker = content.length;
      content = content.slice(0, afterMarker) + "\n" + additions + content.slice(afterMarker);
      fs.writeFileSync(ORCHESTRATOR_FILE, content);
    }
  } catch {}
}

function buildChatSystemPrompt(tasks, projectName) {
  const orchestratorPrompt = readOrchestratorPrompt();
  const history = readOrchestratorHistory(5);
  const taskDetail = tasks.map((t) => {
    let line = "#" + t.id + " [" + t.status + "] " + t.subject;
    if (t.agent) line += " (agent:" + t.agent + ")";
    if (t.owner) line += " (owner:" + t.owner + ")";
    if (t.priority === "high") line += " [HIGH]";
    if (t.blockedBy && t.blockedBy.length) line += " blocked-by:" + t.blockedBy.join(",");
    if (t.activeForm) line += " — " + t.activeForm;
    return line;
  }).join("\n");

  let prompt = "";
  prompt += orchestratorPrompt ? orchestratorPrompt + "\n\n"
                               : "You are the Orchestrator for the " + projectName + " kanban board.\n\n";
  prompt += "## Current Board State\n";
  prompt += "Project: " + projectName + "\n";
  prompt += "Application repo: " + REPO_PATH + "\n\n";
  prompt += taskDetail + "\n\n";
  if (history) prompt += "## Recent Orchestrator Decisions\n" + history + "\n\n";
  return prompt;
}

function boardSummary(tasks) {
  const pending = tasks.filter((t) => t.status === "pending");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed");
  const total = tasks.length;
  const pct = total ? Math.round((completed.length / total) * 100) : 0;
  let summary = `Board: ${completed.length} done / ${inProgress.length} in progress / ${pending.length} pending (${pct}%)`;
  if (inProgress.length > 0) {
    summary += "\nIn progress: " + inProgress.map((t) => `#${t.id} ${t.subject}${t.activeForm ? " — " + t.activeForm : ""}`).join(", ");
  }
  if (pending.length > 0 && pending.length <= 5) {
    summary += "\nUp next: " + pending.map((t) => `#${t.id} ${t.subject}`).join(", ");
  } else if (pending.length > 5) {
    summary += "\nUp next: " + pending.slice(0, 3).map((t) => `#${t.id} ${t.subject}`).join(", ") + ` +${pending.length - 3} more`;
  }
  return summary;
}

function slackNotify(text) {
  if (slackApp && SLACK_CHANNEL_ID) {
    slackApp.client.chat.postMessage({ channel: SLACK_CHANNEL_ID, text }).catch(() => {});
    return;
  }
  if (!SLACK_WEBHOOK) return;
  const payload = JSON.stringify({ text });
  const url = new URL(SLACK_WEBHOOK);
  const req = require("https").request({
    hostname: url.hostname, path: url.pathname + url.search, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
  });
  req.on("error", () => {});
  req.write(payload); req.end();
}

// ── Activity log ─────────────────────────────────────────────────────────────
function logActivity(evt) {
  const ts = new Date().toISOString();
  const record = { ts, ...evt };
  try { fs.appendFileSync(ACTIVITY_FILE, JSON.stringify(record) + "\n"); }
  catch {
    try { fs.mkdirSync(path.dirname(ACTIVITY_FILE), { recursive: true }); } catch {}
    try { fs.appendFileSync(ACTIVITY_FILE, JSON.stringify(record) + "\n"); } catch {}
  }
  try {
    const lines = fs.readFileSync(ACTIVITY_FILE, "utf-8").trim().split("\n");
    if (lines.length > 1200) fs.writeFileSync(ACTIVITY_FILE, lines.slice(lines.length - 1000).join("\n") + "\n");
  } catch {}
  const msg = "data: " + JSON.stringify({ type: "activity", event: record }) + "\n\n";
  for (const res of sseClients) { try { res.write(msg); } catch { sseClients.delete(res); } }

  const summary = boardSummary(readAllTasks());
  let slackMsg = "";
  if (evt.type === "created") {
    slackMsg = `New Task #${evt.taskId}: ${evt.subject}`;
    if (evt.description) slackMsg += "\n> " + evt.description.split("\n")[0].slice(0, 120);
    if (evt.priority === "high") slackMsg += "\nPriority: HIGH";
    if (evt.owner) slackMsg += "\nAssigned: " + evt.owner;
    if (evt.parentId) slackMsg += "\nSubtask of #" + evt.parentId;
  } else if (evt.type === "started") {
    slackMsg = `Task #${evt.taskId} Started: ${evt.subject}`;
    if (evt.owner) slackMsg += "\n" + evt.owner;
    if (evt.activeForm) slackMsg += "\n" + evt.activeForm;
  } else if (evt.type === "completed") {
    slackMsg = `Task #${evt.taskId} Done: ${evt.subject}`;
    if (evt.reportSummary) slackMsg += "\n> " + evt.reportSummary.split("\n")[0].slice(0, 200);
    if (evt.reportPath) slackMsg += "\nReport: " + evt.reportPath;
  } else if (evt.type === "deleted") {
    slackMsg = `Task #${evt.taskId} Deleted: ${evt.subject}`;
  } else if (evt.type === "updated") {
    slackMsg = `Task #${evt.taskId} Updated: ${evt.subject}`;
    if (evt.detail) slackMsg += "\n> " + evt.detail;
  }
  if (slackMsg) slackNotify(slackMsg + "\n" + summary);
}

function readActivity(since, limit) {
  if (!fs.existsSync(ACTIVITY_FILE)) return [];
  try {
    const lines = fs.readFileSync(ACTIVITY_FILE, "utf-8").trim().split("\n").filter(Boolean);
    let events = lines.map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
    if (since) events = events.filter((e) => e.ts > since);
    events.reverse();
    if (limit) events = events.slice(0, limit);
    return events;
  } catch { return []; }
}

// ── Task files ───────────────────────────────────────────────────────────────
// Read every *.json task file directly under `dir`. Skips lock/tmp scratch
// files. Tags each task with its origin so callers know if it's this board's.
function readTasksInDir(dir, dirName) {
  const out = [];
  let files;
  try { files = fs.readdirSync(dir); } catch { return out; }
  for (const file of files) {
    // Task files are named "<numeric-id>.json". Skip lock/tmp scratch and any
    // other JSON in the dir (e.g. chat-history.json).
    if (!/^\d+\.json$/.test(file)) continue;
    const filePath = path.join(dir, file);
    try {
      const st = fs.statSync(filePath);
      if (!st.isFile()) continue;
      const task = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      task._session = dirName;
      task._boardDir = dirName;
      task._file = file;
      task._mtime = st.mtimeMs;
      task._editable = dirName === BOARD_NAME; // editable iff in OUR board dir
      out.push(task);
    } catch {}
  }
  return out;
}

let _aggregateDupeWarned = false;
// Read all tasks this board displays. Single-board mode: only BOARD_DIR.
// Aggregate mode: BOARD_DIR-equivalent dirs from AGGREGATE_DIRS, deduped by id
// (first dir in the list wins). Never scans Claude-Code session UUID dirs, never
// `data`/`_archives`/etc.
function readAllTasks() {
  if (!AGGREGATE_DIRS) {
    return readTasksInDir(BOARD_DIR, BOARD_NAME).sort((a, b) => (a.id || 0) - (b.id || 0));
  }
  const byId = new Map();
  let dupes = 0;
  for (const name of AGGREGATE_DIRS) {
    if (NON_BOARD_NAMES.has(name) || name.includes("/") || name.includes("..") || name.startsWith(".")) continue;
    const dir = path.join(TASKS_DIR, name);
    for (const task of readTasksInDir(dir, name)) {
      const id = String(task.id);
      if (byId.has(id)) { dupes++; continue; } // earlier dir in the list wins
      byId.set(id, task);
    }
  }
  if (dupes && !_aggregateDupeWarned) {
    _aggregateDupeWarned = true;
    console.error("[aggregate] " + dupes + " duplicate task id(s) across " + AGGREGATE_DIRS.join(",") + " — kept the first-dir copy of each, dropped the rest");
  }
  return Array.from(byId.values()).sort((a, b) => (a.id || 0) - (b.id || 0));
}

function getNextId() {
  // IDs are allocated within THIS board's dir only.
  const files = fs.existsSync(BOARD_DIR) ? fs.readdirSync(BOARD_DIR).filter((f) => /^\d+\.json$/.test(f)) : [];
  let max = 0;
  for (const f of files) { const n = parseInt(f.replace(".json", ""), 10); if (n > max) max = n; }
  return max + 1;
}

function createTask(data) {
  const id = getNextId();
  const now = new Date().toISOString();
  const task = {
    id: String(id),
    subject: data.subject || data.title || "Untitled",
    description: data.description || "",
    status: data.status || "pending",
    priority: data.priority || "medium",
    agent: data.agent || "",
    owner: data.owner || "",
    activeForm: data.activeForm || "",
    blockedBy: data.blockedBy || [],
    blocks: data.blocks || [],
    parentId: data.parentId || null,
    reportPath: data.reportPath || null,
    reportSummary: data.reportSummary || null,
    metadata: data.metadata || {},
    createdAt: now,
    updatedAt: now,
  };
  writeTaskFileAtomic(path.join(BOARD_DIR, id + ".json"), task);
  taskSnapshot.set(String(id), { status: task.status, subject: task.subject, owner: task.owner || "", reportSummary: "" });
  logActivity({
    type: "created", taskId: String(id), subject: task.subject,
    agent: task.agent || task.owner || "", detail: task.priority === "high" ? "Priority: high" : "",
    description: task.description, priority: task.priority, owner: task.owner, parentId: task.parentId,
  });
  try {
    const line = "📋 #" + id + " " + (task.subject || "");
    opsAppend("system", line, String(id));
    telegramSend(line);
  } catch {}
  return task;
}

// Writes always target THIS board's own dir. (In aggregate/display mode the
// board still only ever writes to BOARD_DIR — sibling dirs are read-only here.)
function findTaskFile(id) {
  const p = path.join(BOARD_DIR, String(id) + ".json");
  return fs.existsSync(p) ? p : null;
}

function updateTask(id, data) {
  const filePath = findTaskFile(id);
  if (!filePath) return null;
  // Read-modify-write under a per-task lock so concurrent writers (this board's
  // own requests, or — on a shared tasks dir — other boards) can't clobber each
  // other. The write is atomic (temp + rename). Activity logging / SSE happen
  // after the lock is released (they don't touch the task file).
  const result = withTaskLock(filePath, () => {
    let task;
    try { task = JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch { return null; }
    const now = new Date().toISOString();
    const prevStatus = task.status;
    let statusChanged = false;
    if (data.status !== undefined && data.status !== task.status) {
      statusChanged = true;
      task.status = data.status;
      if (data.status === "in_progress" && !task.startedAt) task.startedAt = now;
      if (data.status === "completed") task.completedAt = now;
    }
    if (data.subject !== undefined) task.subject = data.subject;
    if (data.description !== undefined) task.description = data.description;
    if (data.priority !== undefined) task.priority = data.priority;
    if (data.agent !== undefined) task.agent = data.agent;
    if (data.owner !== undefined) task.owner = data.owner;
    if (data.activeForm !== undefined) task.activeForm = data.activeForm;
    if (data.blockedBy !== undefined) task.blockedBy = data.blockedBy;
    if (data.blocks !== undefined) task.blocks = data.blocks;
    if (data.reportPath !== undefined) task.reportPath = data.reportPath;
    if (data.reportSummary !== undefined) task.reportSummary = data.reportSummary;
    if (data.parentId !== undefined) task.parentId = data.parentId;
    if (data.metadata !== undefined) task.metadata = Object.assign({}, task.metadata || {}, data.metadata);
    if (statusChanged && task.status === "completed" && task.metadata && task.metadata.resourceAction) {
      try {
        const actionResult = runResourceAction(task.metadata.resourceAction);
        if (actionResult) {
          const resourceAction = Object.assign({}, task.metadata.resourceAction, {
            status: "completed",
            path: actionResult.path,
            completedAt: now,
          });
          task.metadata = Object.assign({}, task.metadata, { resourceAction, resourceActionResult: actionResult, resourceActionError: null });
          const prev = (task.reportSummary || "").trim();
          task.reportSummary = prev + (prev ? "\n\n" : "") + "[resourceAction] created " + actionResult.path;
        }
      } catch (e) {
        task.status = "in_review";
        statusChanged = prevStatus !== task.status;
        delete task.completedAt;
        const resourceAction = Object.assign({}, task.metadata.resourceAction, {
          status: "failed",
          error: e.message,
          failedAt: now,
        });
        task.metadata = Object.assign({}, task.metadata, { resourceAction, resourceActionError: e.message });
        const prev = (task.reportSummary || "").trim();
        task.reportSummary = prev + (prev ? "\n\n" : "") + "[resourceAction failed] " + e.message;
      }
    }
    task.updatedAt = now;
    writeTaskFileAtomic(filePath, task);
    return { task, prevStatus, statusChanged };
  });
  if (!result) return null;
  const { task, prevStatus, statusChanged } = result;
  taskSnapshot.set(String(id), { status: task.status, subject: task.subject, owner: task.owner || "", reportSummary: task.reportSummary || "" });

  if (statusChanged) {
    if (task.status === "in_progress" && prevStatus === "pending") {
      logActivity({ type: "started", taskId: String(id), subject: task.subject, agent: task.agent || task.owner || "", detail: task.activeForm || "", owner: task.owner, activeForm: task.activeForm, description: task.description });
      try { const line = "▶️ #" + id + " " + (task.subject || ""); opsAppend("system", line, String(id)); telegramSend(line); } catch {}
    } else if (task.status === "completed") {
      logActivity({ type: "completed", taskId: String(id), subject: task.subject, agent: task.agent || task.owner || "", detail: task.reportSummary || "", reportSummary: task.reportSummary, reportPath: task.reportPath, parentId: task.parentId });
      try {
        const head = (task.reportSummary || "").split("\n")[0].slice(0, 240);
        const line = "✅ #" + id + " 완료" + (head ? " — " + head : "");
        opsAppend("system", line, String(id));
        telegramSend(line);
      } catch {}
    } else {
      logActivity({ type: "updated", taskId: String(id), subject: task.subject, agent: task.agent || task.owner || "", detail: prevStatus + " → " + task.status });
    }
  } else if (data.subject !== undefined || data.description !== undefined || data.owner !== undefined) {
    logActivity({ type: "updated", taskId: String(id), subject: task.subject, agent: task.agent || task.owner || "", detail: "Fields updated" });
  }

  // Auto-execute: pending → in_progress with a description, when a CLI runner is
  // on PATH and nothing else is running. Boards with `manualOnly: true` (e.g. an
  // orchestration-only board) never auto-execute — work there is started deliberately.
  // Note: we only ever spawn on the pending→in_progress *transition* here (and in
  // autoPickupTick) — never on board restart for tasks already in_progress.
  if (!config.manualOnly && statusChanged && task.status === "in_progress" && prevStatus !== "in_progress" && task.description && anyCli() && !activeExec) {
    setTimeout(() => { if (claimExec(task)) spawnExecutor(task); }, 100);
  }
  return task;
}

function deleteTask(id) {
  const filePath = findTaskFile(id);
  if (!filePath) return false;
  let taskData = {};
  try { taskData = JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch {}
  fs.unlinkSync(filePath);
  taskSnapshot.delete(String(id));
  logActivity({ type: "deleted", taskId: String(id), subject: taskData.subject || "Unknown", agent: taskData.agent || taskData.owner || "", detail: "" });
  return true;
}

// ── Resource registry — parse frontmatter-backed harness resources ───────────
const AGENTS_DIR = path.join(HARNESS_ROOT, "agents");
const HOOKS_DIR = path.join(HARNESS_ROOT, "hooks");
const SKILLS_DIR = path.join(HARNESS_ROOT, "skills");
const CLAUDE_MD_PATH = path.join(HARNESS_ROOT, "CLAUDE.md");

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  const lines = m[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.startsWith("#") || /^\s/.test(line)) continue; // skip blanks/comments/indented continuations
    const kv = line.match(/^([\w.-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();
    // YAML block scalar: `key: >-` or `key: |` — gather indented lines that follow.
    if (val === ">-" || val === ">" || val === "|" || val === "|-") {
      const fold = val.startsWith(">");
      const parts = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === "")) {
        i++;
        parts.push(lines[i].replace(/^\s+/, ""));
      }
      val = (fold ? parts.join(" ") : parts.join("\n")).trim();
    } else if (val === "") {
      // YAML block list:  key:\n  # comment\n  - a\n  - b
      const items = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (/^\s*#/.test(next) || next.trim() === "") { j++; continue; }   // skip indented comments / blanks
        if (/^\s*-\s/.test(next)) { items.push(next.replace(/^\s*-\s+/, "").trim()); j++; continue; }
        break;
      }
      if (items.length) { val = items; i = j - 1; }
    } else if (val.startsWith("[") && val.endsWith("]")) {
      val = val.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      val = val.replace(/^["']|["']$/g, "");
    }
    meta[key] = val;
  }
  return { meta, body: m[2] };
}

function formatYamlValue(value) {
  if (Array.isArray(value)) return "\n" + value.map((v) => "  - " + String(v)).join("\n");
  const s = String(value == null ? "" : value);
  if (s.includes("\n")) return " |-\n" + s.split("\n").map((line) => "  " + line).join("\n");
  if (s === "" || /[:#\[\]{}]|^\s|\s$/.test(s)) return " " + JSON.stringify(s);
  return " " + s;
}

function stringifyFrontmatter(meta, body) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(meta || {})) {
    if (value === undefined || value === null) continue;
    lines.push(key + ":" + formatYamlValue(value));
  }
  lines.push("---", String(body || "").replace(/^\n+/, ""));
  return lines.join("\n");
}

function appendChangelog(body, changeNote) {
  const note = String(changeNote || "").trim();
  if (!note) return body;
  const line = "- " + new Date().toISOString().slice(0, 10) + ": " + note;
  const text = String(body || "").replace(/\s+$/, "");
  if (/^## Changelog\s*$/m.test(text)) return text + "\n" + line + "\n";
  return text + "\n\n## Changelog\n" + line + "\n";
}

function safeFilePath(dir, file) {
  const raw = String(file || "").trim();
  const base = path.basename(raw);
  if (!base || base !== raw || base === "." || base === ".." || base.startsWith(".") || base.includes("..")) throw new Error("invalid resource name");
  if (!/^[A-Za-z0-9._-]+$/.test(base)) throw new Error("invalid resource name");
  const root = path.resolve(dir);
  const full = path.resolve(root, base);
  if (!full.startsWith(root + path.sep)) throw new Error("invalid resource path");
  return full;
}

function requireContent(value) {
  const content = String(value == null ? "" : value);
  if (!content.trim()) throw new Error("content required");
  return content;
}

function listAgents() {
  if (!fs.existsSync(AGENTS_DIR)) return [];
  return fs.readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .map((f) => {
      try {
        const { meta } = parseFrontmatter(fs.readFileSync(path.join(AGENTS_DIR, f), "utf-8"));
        return {
          name: meta.name || f.replace(/\.md$/, ""),
          file: f,
          mission: meta.mission || "",
          runner: meta.runner || "claude",
          model: meta.model_default || "",
          owns: meta.owns || [],
          group: meta.group || "core",
          role: meta.role || "",
          color: meta.color || "#71717a",
          escalation: meta.escalation || "",
        };
      } catch { return null; }
    })
    .filter(Boolean);
}

function listHooks() {
  if (!fs.existsSync(HOOKS_DIR)) return [];
  return fs.readdirSync(HOOKS_DIR)
    .filter((f) => !f.startsWith("."))
    .map((f) => {
      const filePath = path.join(HOOKS_DIR, f);
      try {
        const st = fs.statSync(filePath);
        if (!st.isFile()) return null;
        const kind = f.endsWith(".sample") ? "sample" : f.endsWith(".template") ? "template" : "file";
        return { name: f, file: f, kind, size: st.size, updatedAt: st.mtime.toISOString() };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function listSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
    .map((f) => {
      try {
        const raw = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
        const { meta } = parseFrontmatter(raw);
        return {
          name: meta.name || f.replace(/\.md$/, ""),
          file: f,
          description: meta.description || "",
          size: Buffer.byteLength(raw, "utf-8"),
        };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

let latestVersionCache = { ts: 0, value: null };
function fetchLatestVersion() {
  const now = Date.now();
  if (latestVersionCache.ts && now - latestVersionCache.ts < 10 * 60 * 1000) {
    return Promise.resolve(latestVersionCache.value);
  }
  return new Promise((resolve) => {
    const req = https.get("https://registry.npmjs.org/agent-kanban-harness/latest", {
      headers: { Accept: "application/json", "User-Agent": "agent-kanban-harness" },
      timeout: 2500,
    }, (registryRes) => {
      let body = "";
      registryRes.on("data", (chunk) => { body += chunk; if (body.length > 200000) req.destroy(); });
      registryRes.on("end", () => {
        try {
          if (registryRes.statusCode < 200 || registryRes.statusCode >= 300) throw new Error("registry status " + registryRes.statusCode);
          const parsed = JSON.parse(body);
          latestVersionCache = { ts: Date.now(), value: parsed.version || null };
          resolve(latestVersionCache.value);
        } catch {
          latestVersionCache = { ts: Date.now(), value: null };
          resolve(null);
        }
      });
    });
    req.on("timeout", () => { try { req.destroy(); } catch {} resolve(null); });
    req.on("error", () => resolve(null));
  });
}

async function harnessOverview() {
  return {
    projectName: PROJECT_NAME,
    goal: config.goal || "",
    repoPath: REPO_PATH,
    goldenDir: config.goldenDir || "golden/",
    agents: listAgents(),
    evaluationLevel: config.evaluationLevel || "review",
    kanbanPort: PORT,
    installedVersion: INSTALLED_VERSION,
    latestVersion: await fetchLatestVersion(),
  };
}

function getAgentFull(name) {
  if (!fs.existsSync(AGENTS_DIR)) return null;
  for (const f of fs.readdirSync(AGENTS_DIR)) {
    if (!f.endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(AGENTS_DIR, f), "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    if ((meta.name || f.replace(/\.md$/, "")) === name) return { name, file: f, meta, body, raw, path: path.join(AGENTS_DIR, f) };
  }
  return null;
}

function saveAgentFull(name, data) {
  const current = getAgentFull(name);
  if (!current) throw new Error("agent not found");
  const body = appendChangelog(requireContent(data.body), data.changeNote);
  const meta = Object.assign({}, current.meta || {}, data.meta || {});
  meta.name = meta.name || current.name || name;
  const filePath = safeFilePath(AGENTS_DIR, current.file);
  fs.writeFileSync(filePath, stringifyFrontmatter(meta, body), "utf-8");
  broadcastRaw({ type: "resources.update", resource: "agents", name });
  return getAgentFull(name);
}

function getHookFull(name) {
  if (!fs.existsSync(HOOKS_DIR)) return null;
  let filePath;
  try { filePath = safeFilePath(HOOKS_DIR, name); } catch { return null; }
  const base = path.basename(filePath);
  try {
    if (!fs.statSync(filePath).isFile()) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const kind = base.endsWith(".sample") ? "sample" : base.endsWith(".template") ? "template" : "file";
    return { name: base, file: base, kind, path: filePath, raw, content: raw };
  } catch { return null; }
}

function getSkillFull(name) {
  if (!fs.existsSync(SKILLS_DIR)) return null;
  for (const f of fs.readdirSync(SKILLS_DIR)) {
    if (!f.endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    if ((meta.name || f.replace(/\.md$/, "")) === name) return { name, file: f, meta, body, raw, path: path.join(SKILLS_DIR, f) };
  }
  return null;
}

function saveHookFull(name, data) {
  const current = getHookFull(name);
  if (!current) throw new Error("hook not found");
  const content = requireContent(data.content !== undefined ? data.content : data.body);
  const filePath = safeFilePath(HOOKS_DIR, current.file);
  fs.writeFileSync(filePath, content, "utf-8");
  broadcastRaw({ type: "resources.update", resource: "hooks", name });
  return getHookFull(name);
}

function saveSkillFull(name, data) {
  const current = getSkillFull(name);
  if (!current) throw new Error("skill not found");
  let content;
  if (data.content !== undefined || data.raw !== undefined) {
    content = requireContent(data.content !== undefined ? data.content : data.raw);
  } else {
    const body = requireContent(data.body);
    const meta = Object.assign({}, current.meta || {}, data.meta || {});
    meta.name = meta.name || current.name || name;
    content = stringifyFrontmatter(meta, body);
  }
  const filePath = safeFilePath(SKILLS_DIR, current.file);
  fs.writeFileSync(filePath, content, "utf-8");
  broadcastRaw({ type: "resources.update", resource: "skills", name });
  return getSkillFull(name);
}

function saveClaudeMd(data) {
  const content = requireContent(data.content !== undefined ? data.content : data.body);
  fs.writeFileSync(CLAUDE_MD_PATH, content, "utf-8");
  broadcastRaw({ type: "resources.update", resource: "claude-md", name: "CLAUDE.md" });
  return { path: CLAUDE_MD_PATH, content };
}

function resourceActionFile(kind, name) {
  const clean = path.basename(String(name || "").trim());
  if (!clean || clean !== String(name || "").trim()) throw new Error("invalid resourceAction name");
  if (kind === "hook-create") return safeFilePath(HOOKS_DIR, clean);
  if (kind === "skill-create") return safeFilePath(SKILLS_DIR, clean.endsWith(".md") ? clean : clean + ".md");
  if (kind === "agent-create") return safeFilePath(AGENTS_DIR, clean.endsWith(".md") ? clean : clean + ".md");
  throw new Error("unsupported resourceAction kind");
}

function defaultResourceTemplate(kind, name) {
  const clean = path.basename(String(name || "").trim()).replace(/\.md$/, "");
  if (kind === "agent-create") {
    const tpl = path.join(AGENTS_DIR, "_TEMPLATE.md");
    if (fs.existsSync(tpl)) return fs.readFileSync(tpl, "utf-8").replace(/name:\s*my-agent/, "name: " + clean).replace(/# My Agent/, "# " + clean);
    return stringifyFrontmatter({ name: clean, mission: "", runner: "claude", group: "core" }, "# " + clean + "\n\n## 1. 역할(ROLE)\n\n## 2. 참조(REFERENCE)\n\n## 3. 제약(CONSTRAINTS)\n\n## 4. 출력(OUTPUT)\n\n## 5. 검증(VALIDATION)\n");
  }
  if (kind === "skill-create") {
    return stringifyFrontmatter({ name: clean, description: "" }, "# /" + clean + "\n\nWhen invoked:\n1. TODO\n");
  }
  return "#!/usr/bin/env bash\nset -e\n\n# " + clean + " hook\n";
}

function resolveResourceTemplate(kind, name, action) {
  const template = action && action.template != null ? String(action.template) : "";
  if (template.trim()) {
    const candidate = template.trim();
    const dir = kind === "hook-create" ? HOOKS_DIR : kind === "skill-create" ? SKILLS_DIR : AGENTS_DIR;
    if (/^[A-Za-z0-9._-]+$/.test(candidate)) {
      try {
        const p = safeFilePath(dir, candidate);
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return fs.readFileSync(p, "utf-8");
      } catch {}
    }
    return template;
  }
  if (kind === "hook-create" && String(name).includes("pre-push")) {
    const p = path.join(HOOKS_DIR, "pre-push.sample");
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8");
  }
  return defaultResourceTemplate(kind, name);
}

function runResourceAction(action) {
  if (!action || typeof action !== "object") return null;
  const kind = String(action.kind || "");
  const name = String(action.name || "").trim();
  if (!name) throw new Error("resourceAction.name required");
  const filePath = resourceActionFile(kind, name);
  if (fs.existsSync(filePath)) throw new Error("resource already exists: " + path.relative(HARNESS_ROOT, filePath));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = requireContent(resolveResourceTemplate(kind, name, action));
  fs.writeFileSync(filePath, content, { encoding: "utf-8", mode: kind === "hook-create" ? 0o755 : 0o644, flag: "wx" });
  broadcastRaw({ type: "resources.update", resource: kind.replace("-create", "s"), name, resources: { agents: listAgents(), hooks: listHooks(), skills: listSkills() } });
  return { path: path.relative(HARNESS_ROOT, filePath), kind, name };
}

// ── SSE ──────────────────────────────────────────────────────────────────────
const sseClients = new Set();
let lastHash = "";
function broadcast(data) {
  // Dedupe by id before hashing/sending — a stray duplicate must not flip the
  // hash back and forth and spam SSE clients.
  if (data && Array.isArray(data.tasks)) data = Object.assign({}, data, { tasks: dedupeById(data.tasks) });
  const hash = JSON.stringify(data.tasks?.map((t) => t.status + t.id + (t.updatedAt || "")));
  if (hash === lastHash) return;
  lastHash = hash;
  const msg = "data: " + JSON.stringify(data) + "\n\n";
  for (const res of sseClients) { try { res.write(msg); } catch { sseClients.delete(res); } }
}
function broadcastRaw(data) {
  const msg = "data: " + JSON.stringify(data) + "\n\n";
  for (const res of sseClients) { try { res.write(msg); } catch { sseClients.delete(res); } }
}

// ── Ops Thread (Telegram mirror) ─────────────────────────────────────────────
// Append-only chat log between the operator (you) and the agents, persisted as
// JSONL and broadcast over SSE. Optionally mirrored to Telegram: outbound via
// sendMessage, inbound via getUpdates long-poll. Both halves are best-effort —
// missing token / chatId just disables that half; the panel still works locally.
const TELEGRAM = config.telegram || {};
let telegramOffset = 0;
let telegramPollerHandle = null;

function opsAppend(role, text, taskId, opts) {
  const msg = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    ts: new Date().toISOString(),
    role: role || "system",
    text: String(text == null ? "" : text),
    taskId: taskId != null ? String(taskId) : null,
    source: (opts && opts.source) || "kanban",
  };
  try {
    fs.mkdirSync(path.dirname(OPS_THREAD_FILE), { recursive: true });
    fs.appendFileSync(OPS_THREAD_FILE, JSON.stringify(msg) + "\n");
  } catch (e) {
    console.error("[ops-thread] append failed:", e && e.code ? e.code : e);
  }
  try {
    const lines = fs.readFileSync(OPS_THREAD_FILE, "utf-8").trim().split("\n");
    if (lines.length > 2400) fs.writeFileSync(OPS_THREAD_FILE, lines.slice(-2000).join("\n") + "\n");
  } catch {}
  broadcastRaw({ type: "ops.message", message: msg });
  return msg;
}

function readOpsThread(since) {
  if (!fs.existsSync(OPS_THREAD_FILE)) return [];
  try {
    let msgs = fs.readFileSync(OPS_THREAD_FILE, "utf-8").trim().split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (since) {
      let idx = -1;
      for (let i = 0; i < msgs.length; i++) {
        if (msgs[i].id === since || (msgs[i].ts && msgs[i].ts > since)) { idx = i; break; }
      }
      if (idx < 0) msgs = [];
      else if (msgs[idx].id === since) msgs = msgs.slice(idx + 1);
      else msgs = msgs.slice(idx);
    }
    if (msgs.length > 500) msgs = msgs.slice(-500);
    return msgs;
  } catch { return []; }
}

function telegramHttp(method, params) {
  return new Promise((resolve) => {
    if (!TELEGRAM.botToken) return resolve({ ok: false, error: "no token" });
    const body = JSON.stringify(params || {});
    const req = require("https").request({
      hostname: "api.telegram.org",
      path: `/bot${TELEGRAM.botToken}/${method}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 30000,
    }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({ ok: false, error: "parse" }); } });
    });
    req.on("error", (e) => resolve({ ok: false, error: String(e && e.code || e.message || e) }));
    req.on("timeout", () => { try { req.destroy(); } catch {} resolve({ ok: false, error: "timeout" }); });
    req.write(body); req.end();
  });
}

function telegramSend(text) {
  if (!TELEGRAM.botToken || !TELEGRAM.chatId) return;
  telegramHttp("sendMessage", { chat_id: TELEGRAM.chatId, text: String(text == null ? "" : text), disable_web_page_preview: true })
    .then((r) => { if (!r.ok) console.error("[telegram] send failed:", r.error || r.description); });
}

function loadTelegramOffset() {
  try { telegramOffset = JSON.parse(fs.readFileSync(TELEGRAM_OFFSET_FILE, "utf-8")).offset || 0; } catch { telegramOffset = 0; }
}
function saveTelegramOffset() {
  try { fs.mkdirSync(path.dirname(TELEGRAM_OFFSET_FILE), { recursive: true }); fs.writeFileSync(TELEGRAM_OFFSET_FILE, JSON.stringify({ offset: telegramOffset })); } catch {}
}

function telegramChatAllowed(chatId) {
  const id = String(chatId);
  if (TELEGRAM.allowedChatIds && TELEGRAM.allowedChatIds.length) return TELEGRAM.allowedChatIds.map(String).includes(id);
  if (TELEGRAM.chatId) return String(TELEGRAM.chatId) === id;
  return false;
}

async function telegramPollOnce() {
  const r = await telegramHttp("getUpdates", { offset: telegramOffset + 1, timeout: 25, allowed_updates: ["message"] });
  if (!r || !r.ok || !Array.isArray(r.result)) return { updates: 0, error: r && r.error };
  let updates = 0;
  for (const u of r.result) {
    if (u.update_id > telegramOffset) telegramOffset = u.update_id;
    const m = u.message;
    if (!m || !m.text) continue;
    if (!telegramChatAllowed(m.chat && m.chat.id)) continue;
    opsAppend("operator", m.text, null, { source: "telegram" });
    updates++;
  }
  if (updates) saveTelegramOffset();
  return { updates };
}

function startTelegramPoller() {
  if (telegramPollerHandle) return;
  if (!TELEGRAM.botToken || !TELEGRAM.chatId || !TELEGRAM.pollEnabled) return;
  loadTelegramOffset();
  const tick = async () => {
    try { await telegramPollOnce(); }
    catch (e) { console.error("[telegram] poll error:", e && e.message); await new Promise((r) => setTimeout(r, 5000)); }
    telegramPollerHandle = setTimeout(tick, TELEGRAM.pollIntervalMs || 1500);
  };
  telegramPollerHandle = setTimeout(tick, 100);
  console.log("  Telegram: poller started (chat=" + TELEGRAM.chatId + ")");
}

// ── Claude / Codex CLI auto-executor (optional) ──────────────────────────────
let cliAvailable = false;   // `claude` on PATH (the default implementer)
let codexAvailable = false; // `codex` on PATH (cross-validator / alt implementer)
function anyCli() { return cliAvailable || codexAvailable; } // at least one runner usable

// Auto-exec retry policy. A failed auto-executed task goes back to `pending`,
// but auto-pickup only re-claims it after a per-failure backoff; after this many
// failures it is quarantined to `in_review` (needs human) — never an infinite loop.
const AUTO_EXEC_MAX_RETRIES = 3;
function autoExecBackoffMs(failures) {
  const f = Math.max(1, (failures | 0) || 1);
  return Math.min(2 ** f, 30) * 60 * 1000; // 2m → 4m → 8m → … capped at 30m
}

function checkClaudeCLI() {
  if (process.env.CLAUDECODE) { console.log("  CLI: unavailable (nested session)"); return; }
  try { execSync("which claude", { encoding: "utf-8", timeout: 5000 }); cliAvailable = true; }
  catch { cliAvailable = false; }
  try { execSync("which codex", { encoding: "utf-8", timeout: 5000 }); codexAvailable = true; }
  catch { codexAvailable = false; }
}

let activeExec = null; // { process, taskId, output, phase }

// ── Cross-process executor claim ─────────────────────────────────────────────
// `activeExec` is process-local — it can't stop *another* board (sharing the
// tasks dir) from spawning an executor for the same task. So before spawning we
// place an on-disk claim in the task's metadata.execClaim = { pid, board, at }.
// claimExec(task): under the task lock, re-read the task; if a live foreign pid
// already owns it, return false (bail). Otherwise stamp our claim and return
// true. Idempotent for our own pid.
const EXEC_BOARD = config.area || BOARD_NAME;
function claimExec(task) {
  const id = String(task && task.id);
  const filePath = findTaskFile(id);
  if (!filePath) return false;
  return withTaskLock(filePath, () => {
    let cur;
    try { cur = JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch { return false; }
    const claim = cur.metadata && cur.metadata.execClaim;
    if (claim && claim.pid && claim.pid !== process.pid && pidAlive(claim.pid)) {
      // Another board's live process owns this task — don't double-spawn.
      console.error("[exec-claim] #" + id + " owned by board=" + (claim.board || "?") + " pid=" + claim.pid + " — not spawning here");
      return false;
    }
    cur.metadata = Object.assign({}, cur.metadata || {}, { execClaim: { pid: process.pid, board: EXEC_BOARD, at: new Date().toISOString() } });
    cur.updatedAt = new Date().toISOString();
    writeTaskFileAtomic(filePath, cur);
    return true;
  });
}
// (The claim is released by writing `metadata.execClaim = null` through the
// normal locked updateTask path on every executor terminal state — see
// finishImplementerOnly / runReviewPhase / stopExec.)
// On startup, clear any execClaim in BOARD_DIR whose pid is not alive (a crashed
// board left it behind). Don't touch claims owned by other live processes.
function clearStaleExecClaims() {
  let files;
  try { files = fs.readdirSync(BOARD_DIR).filter((f) => /^\d+\.json$/.test(f)); } catch { return; }
  for (const f of files) {
    const filePath = path.join(BOARD_DIR, f);
    try {
      let cur; try { cur = JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch { continue; }
      const claim = cur.metadata && cur.metadata.execClaim;
      if (claim && claim.pid && !pidAlive(claim.pid)) {
        withTaskLock(filePath, () => {
          let c2; try { c2 = JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch { return; }
          const cl = c2.metadata && c2.metadata.execClaim;
          if (cl && cl.pid && !pidAlive(cl.pid)) {
            c2.metadata = Object.assign({}, c2.metadata, { execClaim: null });
            c2.updatedAt = new Date().toISOString();
            writeTaskFileAtomic(filePath, c2);
            console.error("[exec-claim] cleared stale claim on #" + (c2.id || f) + " (dead pid " + cl.pid + ")");
          }
        });
      }
    } catch {}
  }
}

// Hard rules every auto-executed task must follow. Prepended to the prompt so
// the spawned CLI inherits them without an external CLAUDE.md hop. Keep this
// short — it costs every auto-exec turn.
const EXECUTOR_GUARDRAILS = [
  "## Hard rules — must follow, every task",
  "- ALL work goes through a kanban card. You ARE working a card right now. When you finish, set THIS task to `in_review` (not `completed` — only the meta-orchestrator / operator marks `completed`). Write a `reportSummary`: what you produced, what is left undone, and any follow-up.",
  "- Do the WHOLE task. If the task asks for parts A, B, C, produce all of them. If you cannot finish a part, still produce the parts you can, and say in `reportSummary` exactly which part is unfinished and why — do not bail out with \"needs human review\" unless something genuinely blocks you.",
  "- HANDOFFS: if your work needs another area to act, create a NEW task on this board with `metadata.handoff = \"<target-area-id>\"` and `metadata.area = \"<your-area-id>\"` (e.g. handoff `02a`, area `01`). The handoff-broker relays it to the target board. Areas never call each other directly — always via a handoff card.",
  "- NEVER include `Co-Authored-By` lines or any Claude/Anthropic/Codex attribution in git commit messages, PR descriptions, or any committed text. This applies to every commit, including amends.",
  "- NEVER run destructive git operations (force-push, reset --hard, branch -D, push --no-verify) without an explicit user request.",
  "- NEVER commit `.env`, `config.js`, or any secret. Both are gitignored — keep it that way.",
  "- Stay inside the agent's `owns` globs (selvedge boundaries). If you need to touch something outside `owns`, create a handoff card to the area that owns it.",
  "- Read your agent definition above (mission / owns / Inputs / Process / Hard rules) and the files it points at, then do the task per that process.",
  "",
].join("\n");

// Read the agent definition .md for the task's agent (so the executor inherits
// the agent's mission / owns / process / hard rules — not just the task text).
function readAgentDef(agentName) {
  if (!agentName || !fs.existsSync(AGENTS_DIR)) return "";
  const direct = path.join(AGENTS_DIR, agentName + ".md");
  if (fs.existsSync(direct)) { try { return fs.readFileSync(direct, "utf-8"); } catch { return ""; } }
  try {
    for (const f of fs.readdirSync(AGENTS_DIR)) {
      if (!f.endsWith(".md")) continue;
      const raw = fs.readFileSync(path.join(AGENTS_DIR, f), "utf-8");
      const m = raw.match(/^---[\s\S]*?\n\s*name:\s*([^\n]+)/m);
      if (m && m[1].trim().replace(/^["']|["']$/g, "") === agentName) return raw;
    }
  } catch {}
  return "";
}

// Resolve which runner a task uses: explicit task override, then the agent's
// declared runner, then "claude". Recognised: "claude", "codex", "both",
// "reviewer:codex", "reviewer:claude".
function resolveRunner(task) {
  if (task && task.metadata && typeof task.metadata.runner === "string" && task.metadata.runner.trim()) {
    return task.metadata.runner.trim();
  }
  const agentName = (task && (task.agent || task.owner)) || "";
  if (agentName && Array.isArray(config.agents)) {
    const a = config.agents.find((x) => x && x.name === agentName);
    if (a && typeof a.runner === "string" && a.runner.trim()) return a.runner.trim();
  }
  return "claude";
}

// Spawn one CLI process, pump `prompt` to its stdin (both `claude` and `codex exec -`
// read the prompt from stdin — avoids ARG_MAX with large agent-definition prompts),
// collect its text output.
//  - useStreamJson=true  → parse `claude` stream-json lines, extract assistant text
//  - useStreamJson=false → treat stdout as raw text (codex)
// onChunk(text) fires per text fragment; onClose(code, fullOutput) on exit.
// Returns the child process, or null (with onClose(-1,"") scheduled) on spawn error.
function spawnCli(cmd, args, prompt, useStreamJson, taskId, onChunk, onClose) {
  const execEnv = Object.assign({}, process.env);
  delete execEnv.ANTHROPIC_API_KEY;
  let proc;
  try {
    proc = spawn(cmd, args, { cwd: REPO_PATH, env: execEnv, stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    setImmediate(() => onClose(-1, ""));
    return null;
  }
  let out = "";
  if (useStreamJson) {
    let buffer = "";
    proc.stdout.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          let text = "";
          if (json.type === "assistant" && json.subtype === "text") text = json.text || "";
          else if (json.type === "assistant" && json.message && json.message.content) {
            json.message.content.forEach((c) => { if (c.type === "text") text += c.text; });
          } else if (json.type === "content_block_delta" && json.delta) text = json.delta.text || "";
          if (text) { out += text; onChunk(text); }
        } catch {}
      }
    });
  } else {
    proc.stdout.on("data", (data) => { const text = data.toString(); out += text; onChunk(text); });
  }
  proc.stderr.on("data", (data) => broadcastRaw({ type: "exec_error", taskId, chunk: data.toString() }));
  proc.on("error", () => {});
  proc.on("close", (code) => onClose(code, out));
  try { proc.stdin.write(prompt); proc.stdin.end(); } catch {}
  return proc;
}

// Two Claude arg sets: `sonnet` for generation (default), `opus` for verification — used in the
// reviewer phase, and as the implementer arg for agents declared `model_default: both` (the
// high-stakes verifier agents like item-content-verifier / item-data-validator / round-assembler).
// `sonnet`/`opus` are "latest of that family" (Sonnet 4.6 / Opus 4.7 at the time of writing).
const CLAUDE_ARGS = ["-p", "--verbose", "--output-format", "stream-json", "--model", "sonnet", "--no-session-persistence"];
const CLAUDE_REVIEWER_ARGS = ["-p", "--verbose", "--output-format", "stream-json", "--model", "opus", "--no-session-persistence"];
function agentModelDefault(agentDefText) {
  if (!agentDefText) return null;
  const m = agentDefText.match(/^model_default:\s*([^\s\n#]+)/m);
  return m ? m[1].trim() : null;
}
// `codex exec -` reads the prompt from stdin (the `-` is the literal stdin marker).
// We pump the prompt to stdin (like `claude`) rather than passing it as an argv element
// so multi-KB agent-definition prompts don't risk ARG_MAX. (`--quiet` is not a valid
// `codex exec` flag — it errors out — so it was removed.)
const CODEX_ARGS = ["exec", "-"];

// Finish a task after the implementer (no reviewer phase): force in_review,
// prefer a self-written reportSummary, else fall back to captured output.
function finishImplementerOnly(taskId, task, code, output) {
  let cur = null;
  try { const fp = findTaskFile(taskId); if (fp) cur = JSON.parse(fs.readFileSync(fp, "utf-8")); } catch {}
  if (code === 0) {
    const summary = (cur && cur.reportSummary && cur.reportSummary.trim()) ? cur.reportSummary : (output || "").slice(0, 800).trim();
    const upd = { status: "in_review", reportSummary: summary || "(executor produced no summary)", metadata: { execClaim: null } };
    // updateTask merges metadata, so clear the failure-backoff fields by nulling them.
    if (cur && cur.metadata && (cur.metadata.execFailedAt || cur.metadata.execFailures)) Object.assign(upd.metadata, { execFailedAt: null, execFailures: null, execLastError: null });
    updateTask(taskId, upd);
    broadcastRaw({ type: "exec_done", taskId, exitCode: 0 });
    return;
  }
  // Failure: count it. Auto-pickup re-claim is gated by autoExecBackoffMs; after
  // AUTO_EXEC_MAX_RETRIES the task is quarantined to in_review (needs human) so a
  // CLI/permission/test failure can't re-run every 20s forever.
  const baseMeta = (cur && cur.metadata) || (task && task.metadata) || {};
  const failures = ((baseMeta.execFailures | 0) || 0) + 1;
  const errNote = "auto-exec failed (exit " + code + ") — attempt " + failures + "/" + AUTO_EXEC_MAX_RETRIES;
  if (failures >= AUTO_EXEC_MAX_RETRIES) {
    const prevSummary = (cur && cur.reportSummary && cur.reportSummary.trim()) ? cur.reportSummary + "\n\n" : "";
    updateTask(taskId, {
      status: "in_review",
      reportSummary: prevSummary + "[quarantined] " + errNote + " — auto-pickup stopped, needs human.",
      metadata: Object.assign({}, baseMeta, {
        execFailures: failures, execLastError: "exit " + code, execFailedAt: Date.now(), execClaim: null,
        crossValidation: { agreement: "exec-failed", verdict: "needs_human", note: errNote },
      }),
    });
    logActivity({ type: "updated", taskId, subject: (task && task.subject) || "", detail: "Quarantined to in_review after " + failures + " exec failures" });
  } else {
    updateTask(taskId, {
      status: "pending",
      metadata: Object.assign({}, baseMeta, { execFailures: failures, execLastError: "exit " + code, execFailedAt: Date.now(), execClaim: null }),
    });
    logActivity({ type: "updated", taskId, subject: (task && task.subject) || "", detail: errNote + " — retrying after " + Math.round(autoExecBackoffMs(failures) / 60000) + "m backoff" });
  }
  broadcastRaw({ type: "exec_done", taskId, exitCode: code });
}

// Build the cross-validator prompt handed to the reviewer model.
function buildReviewPrompt(task, agentBlock, implementerName, implementerOutput) {
  return "## You are the cross-validator (" + (implementerName === "Claude" ? "Codex" : "Claude") +
    "). Review the work below — do NOT redo it, just review.\n\n" + agentBlock +
    "## Task that was done\n" + task.subject + "\n\n" + (task.description || "(no description)") +
    "\n\n## What the implementer (" + implementerName + ") produced/reported\n" + (implementerOutput || "").slice(0, 12000) +
    "\n\nReview per the agent's checklist. State a clear verdict on its own line: 'VERDICT: AGREED' (work is sound) or 'VERDICT: DISAGREED' (you found a problem the implementer missed — describe it). If you disagree with a specific item, say which. Be specific. Working directory: " + REPO_PATH;
}

// Run the reviewer model over the implementer's output, then write the merged
// reportSummary + crossValidation metadata and put the task in_review.
// reviewerCmd is "codex" or "claude"; availability is checked here.
function runReviewPhase(taskId, task, agentBlock, reviewerCmd, implementerName, implementerOutput) {
  const reviewerLabel = reviewerCmd === "codex" ? "codex" : "claude";
  const reviewerAvailable = reviewerCmd === "codex" ? codexAvailable : cliAvailable;

  let implSummary = "";
  try { const fp = findTaskFile(taskId); if (fp) { const cur = JSON.parse(fs.readFileSync(fp, "utf-8")); if (cur && cur.reportSummary && cur.reportSummary.trim()) implSummary = cur.reportSummary.trim(); } } catch {}
  if (!implSummary) implSummary = (implementerOutput || "").slice(0, 800).trim();
  implSummary = implSummary || "(implementer produced no summary)";

  // The implementer exited 0 to reach here, so any prior failure-backoff state is
  // stale — null it out (updateTask merges metadata, so null the keys). Also
  // release the executor claim — this task is done as far as the executor goes.
  const clearBackoff = { execFailedAt: null, execFailures: null, execLastError: null, execClaim: null };
  const finalizeReview = (reviewerOut, ok) => {
    activeExec = null;
    if (!ok) {
      const merged = implSummary + "\n\n[" + reviewerLabel + " review unavailable — single-model result]";
      updateTask(taskId, {
        status: "in_review",
        reportSummary: merged,
        metadata: Object.assign({}, (task && task.metadata) || {}, clearBackoff, { crossValidation: { agreement: "single-model-fallback", verdict: "agreed", note: reviewerLabel + " review unavailable" } }),
      });
      broadcastRaw({ type: "exec_done", taskId, exitCode: 0 });
      return;
    }
    // Verdict contract: the reviewer states `VERDICT: AGREED` or `VERDICT: DISAGREED`
    // on its own line. Explicit AGREED ⇒ agreed; explicit DISAGREED — or no parseable
    // verdict at all (malformed review) ⇒ treat as disagreement, don't auto-agree.
    const mVerdict = (reviewerOut || "").match(/VERDICT:\s*(AGREED|DISAGREED)/i);
    const disagreed = !mVerdict || /DISAGREED/i.test(mVerdict[1]);
    const merged = implSummary + "\n\n[" + reviewerLabel + " review — " + (disagreed ? "DISAGREED" : "agreed") + "]\n" + (reviewerOut || "").slice(0, 2000);
    updateTask(taskId, {
      status: "in_review",
      reportSummary: merged,
      metadata: Object.assign({}, (task && task.metadata) || {}, clearBackoff, {
        crossValidation: { agreement: disagreed ? "disagreed" : "agreed", verdict: disagreed ? "needs_human" : "agreed", reviewer: reviewerLabel },
      }),
    });
    broadcastRaw({ type: "exec_done", taskId, exitCode: 0 });
  };

  if (!reviewerAvailable) { finalizeReview("", false); return; }
  broadcastRaw({ type: "exec", taskId, chunk: "\n\n— cross-validation (" + reviewerLabel + ") —\n" });
  const reviewPrompt = buildReviewPrompt(task, agentBlock, implementerName, implementerOutput);
  // both `codex exec -` and `claude` read the prompt from stdin.
  const reviewerArgs = reviewerCmd === "codex" ? CODEX_ARGS : CLAUDE_REVIEWER_ARGS;
  const reviewerStdin = reviewPrompt;
  const reviewerStreamJson = reviewerCmd !== "codex";
  const proc = spawnCli(
    reviewerCmd, reviewerArgs, reviewerStdin, reviewerStreamJson, taskId,
    (text) => { if (activeExec) { activeExec.output += text; } broadcastRaw({ type: "exec", taskId, chunk: text }); },
    (code, reviewerOut) => finalizeReview(reviewerOut, code === 0),
  );
  if (proc) activeExec = { process: proc, taskId, output: "", phase: "review" };
  else finalizeReview("", false);
}

function spawnExecutor(task) {
  if (!anyCli() || activeExec) return;
  const taskId = String(task.id);
  // Cross-process claim (idempotent for our own pid). Bail if another live board
  // already owns this task — its executor will (or already did) handle it.
  if (!claimExec(task)) { broadcastRaw({ type: "exec_skipped", taskId, reason: "claimed-by-another-board" }); return; }
  const runner = resolveRunner(task);
  const agentDef = readAgentDef(task.agent || task.owner);
  const agentBlock = agentDef ? "## Your agent definition (read it, follow it)\n\n" + agentDef + "\n\n---\n\n" : "";
  const prompt = EXECUTOR_GUARDRAILS + agentBlock + "## Task\n" + task.subject + "\n\n" + (task.description || "(no description)") + "\n\nWorking directory: " + REPO_PATH;
  const pump = (text) => { if (activeExec) { activeExec.output += text; } broadcastRaw({ type: "exec", taskId, chunk: text }); };

  // Pick the implementer CLI. "codex"/"reviewer:claude" prefer codex; everything
  // else prefers claude. Whichever is preferred but not on PATH falls back to the
  // other (the anyCli() gate above guarantees at least one is available).
  const preferCodex = (runner === "codex" || runner === "reviewer:claude");
  const useCodexImpl = preferCodex ? codexAvailable : (!cliAvailable && codexAvailable);

  // Pick the Claude implementer args. Default = sonnet (generation). For "verification" agents —
  // identified by `model_default: both` in the agent def — the implementer Claude run also uses
  // opus (the work itself IS verification, so model the whole run on the high-tier model). The
  // reviewer-phase Claude always uses CLAUDE_REVIEWER_ARGS (opus) regardless.
  const modelDefault = agentModelDefault(agentDef);
  const claudeImplArgs = (modelDefault === "both") ? CLAUDE_REVIEWER_ARGS : CLAUDE_ARGS;

  broadcastRaw({ type: "exec_start", taskId, subject: task.subject });
  logActivity({ type: "started", taskId, subject: task.subject, detail: "Auto-execute started (runner=" + runner + ")" });

  // After the implementer exits 0: run the reviewer phase for cross-validated
  // runners, else finish. (implName names whoever actually implemented.)
  const afterImplement = (code, output, implName) => {
    activeExec = null;
    if (code !== 0) { finishImplementerOnly(taskId, task, code, output); return; }
    if (runner === "both" || runner === "reviewer:codex") { runReviewPhase(taskId, task, agentBlock, "codex", implName, output); return; }
    if (runner === "reviewer:claude") { runReviewPhase(taskId, task, agentBlock, "claude", implName, output); return; }
    finishImplementerOnly(taskId, task, code, output);
  };

  const runClaudeImpl = () => {
    const p = spawnCli("claude", claudeImplArgs, prompt, true, taskId, pump, (code, output) => afterImplement(code, output, "Claude"));
    if (!p) { finishImplementerOnly(taskId, task, -1, ""); return; }
    activeExec = { process: p, taskId, output: "", phase: "implement" };
  };

  if (useCodexImpl) {
    const p = spawnCli("codex", CODEX_ARGS, prompt, false, taskId, pump, (code, output) => {
      activeExec = null;
      if (code !== 0 && cliAvailable) {
        // codex implementer failed mid-run — fall back to claude once, then finish
        // (no codex-review-of-the-claude-fallback; the codex-implement runners don't review with codex).
        broadcastRaw({ type: "exec", taskId, chunk: "\n\n— codex implementer failed (exit " + code + "); retrying once with claude —\n" });
        logActivity({ type: "updated", taskId, subject: task.subject, detail: "codex impl failed (exit " + code + ") — falling back to claude" });
        const p2 = spawnCli("claude", claudeImplArgs, prompt, true, taskId, pump, (c2, o2) => { activeExec = null; finishImplementerOnly(taskId, task, c2, o2); });
        if (p2) { activeExec = { process: p2, taskId, output: "", phase: "implement" }; return; }
        finishImplementerOnly(taskId, task, code, output); return;
      }
      afterImplement(code, output, "Codex");
    });
    if (!p) { if (cliAvailable) { runClaudeImpl(); return; } finishImplementerOnly(taskId, task, -1, ""); return; }
    activeExec = { process: p, taskId, output: "", phase: "implement" };
    return;
  }
  runClaudeImpl();
}
function stopExec() {
  if (!activeExec) return null;
  const taskId = activeExec.taskId;
  try { activeExec.process.kill(); } catch {}
  activeExec = null;
  updateTask(taskId, { status: "pending", metadata: { execClaim: null } });
  broadcastRaw({ type: "exec_done", taskId, exitCode: -1, stopped: true });
  logActivity({ type: "updated", taskId, subject: "", detail: "Execution stopped by user" });
  return taskId;
}

// ── Auto-pickup loop (optional — content-line boards) ────────────────────────
const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
function autoPickupTick() {
  if (config.manualOnly || !anyCli() || activeExec) return;
  let tasks;
  try { tasks = readAllTasks(); } catch { return; }
  const now = Date.now();
  const candidates = tasks.filter((t) => {
    if (!t || t.status !== "pending" || !t.description) return false;
    const m = t.metadata || {};
    // Handoff *source* cards are relayed to another board by the handoff-broker —
    // they are not executed here. (The relayed target card carries `brokered_from`,
    // not `handoff`, so it is still eligible.)
    if (m.handoff) return false;
    // Back off recently-failed tasks; quarantined ones are already in_review so
    // they won't reach here at all.
    if (m.execFailedAt && (now - m.execFailedAt) < autoExecBackoffMs(m.execFailures)) return false;
    // Already claimed by another live board's executor — leave it to them.
    if (m.execClaim && m.execClaim.pid && m.execClaim.pid !== process.pid && pidAlive(m.execClaim.pid)) return false;
    // Area scope (null ⇒ no filter).
    if (config.area && !(m.area === config.area || t.project === config.area)) return false;
    return true;
  });
  if (!candidates.length) return;
  candidates.sort((a, b) => {
    const ra = PRIORITY_RANK[(a.priority || "medium")] ?? 2;
    const rb = PRIORITY_RANK[(b.priority || "medium")] ?? 2;
    if (ra !== rb) return ra - rb;
    return (a.id || 0) - (b.id || 0);
  });
  const pick = candidates[0];
  updateTask(String(pick.id), { status: "in_progress" }); // triggers spawnExecutor
}

// ── Slack bot (Socket Mode) — optional ───────────────────────────────────────
async function initSlackBot() {
  if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) { console.log("  Slack Bot: disabled (no tokens)"); return; }
  try {
    const { App } = require("@slack/bolt");
    slackApp = new App({ token: SLACK_BOT_TOKEN, appToken: SLACK_APP_TOKEN, socketMode: true });

    slackApp.command(SLACK_COMMAND, async ({ command, ack, respond, client }) => {
      await ack();
      const parts = (command.text || "").trim().split(/\s+/);
      const sub = (parts[0] || "").toLowerCase();
      const restText = parts.slice(1).join(" ");
      switch (sub) {
        case "board":
        case "": {
          await respond({ blocks: buildBoardBlocks(readAllTasks()), text: PROJECT_NAME + " kanban", response_type: "ephemeral" });
          break;
        }
        case "list": {
          await respond({ blocks: buildTaskListBlocks(readAllTasks()), response_type: "ephemeral" });
          break;
        }
        case "add": {
          if (!restText) await client.views.open({ trigger_id: command.trigger_id, view: buildAddTaskModal() });
          else { const task = createTask({ subject: restText }); await respond({ text: `Task #${task.id} created: ${task.subject}`, response_type: "in_channel" }); }
          break;
        }
        case "ask": {
          if (!restText) { await respond({ text: "Usage: `" + SLACK_COMMAND + " ask <question>`", response_type: "ephemeral" }); break; }
          if (slackAskActive) { await respond({ text: "Another ask is in progress. Please wait.", response_type: "ephemeral" }); break; }
          if (!cliAvailable) { await respond({ text: "Claude CLI not available.", response_type: "ephemeral" }); break; }
          await respond({ text: `Asking Claude: ${restText}`, response_type: "ephemeral" });
          handleSlackAsk(restText, command.channel_id, client);
          break;
        }
        case "exec": {
          if (SLACK_ADMIN_USERS.length > 0 && !SLACK_ADMIN_USERS.includes(command.user_id)) { await respond({ text: "Permission denied.", response_type: "ephemeral" }); break; }
          const execId = restText.replace("#", "");
          if (!execId) { await respond({ text: "Usage: `" + SLACK_COMMAND + " exec <task_id>`", response_type: "ephemeral" }); break; }
          if (!cliAvailable) { await respond({ text: "Claude CLI not available.", response_type: "ephemeral" }); break; }
          if (activeExec) { await respond({ text: "Already executing task #" + activeExec.taskId + ".", response_type: "ephemeral" }); break; }
          const taskToExec = readAllTasks().find((t) => String(t.id) === execId);
          if (!taskToExec) { await respond({ text: `Task #${execId} not found.`, response_type: "ephemeral" }); break; }
          if (taskToExec.status === "pending") updateTask(execId, { status: "in_progress" });
          if (!activeExec) spawnExecutor(taskToExec);
          await respond({ text: `Executing task #${execId}: ${taskToExec.subject}`, response_type: "in_channel" });
          break;
        }
        case "stop": {
          const stoppedId = stopExec();
          await respond(stoppedId ? { text: `Stopped execution of task #${stoppedId}.`, response_type: "in_channel" } : { text: "No active execution.", response_type: "ephemeral" });
          break;
        }
        default:
          await respond({ text: "Unknown: `" + sub + "`\nAvailable: `board` `list` `add` `ask` `exec` `stop`", response_type: "ephemeral" });
      }
    });

    slackApp.action(/^task_(start|complete|delete)_/, async ({ action, ack, respond, body }) => {
      await ack();
      const match = action.action_id.match(/^task_(start|complete|delete)_(.+)$/);
      if (!match) return;
      const actionType = match[1]; const taskId = match[2];
      const userName = (body.user && body.user.name) || (body.user && body.user.id) || "someone";
      if (actionType === "start") {
        const task = updateTask(taskId, { status: "in_progress" });
        await respond(task ? { text: "Task #" + taskId + " started by " + userName + ": " + task.subject, response_type: "in_channel", replace_original: false } : { text: "Task #" + taskId + " not found.", response_type: "ephemeral" });
      } else if (actionType === "complete") {
        const task = updateTask(taskId, { status: "completed" });
        await respond(task ? { text: "Task #" + taskId + " completed by " + userName + ": " + task.subject, response_type: "in_channel", replace_original: false } : { text: "Task #" + taskId + " not found.", response_type: "ephemeral" });
      } else {
        const task = readAllTasks().find((t) => String(t.id) === taskId);
        const ok = deleteTask(taskId);
        await respond(ok ? { text: "Task #" + taskId + " deleted by " + userName + (task ? ": " + task.subject : ""), response_type: "in_channel", replace_original: false } : { text: "Task #" + taskId + " not found.", response_type: "ephemeral" });
      }
    });

    slackApp.view("add_task_modal", async ({ ack, view }) => {
      await ack();
      const vals = view.state.values;
      const subject = vals.subject_block.subject_input.value || "";
      const description = (vals.desc_block && vals.desc_block.desc_input && vals.desc_block.desc_input.value) || "";
      const priority = (vals.priority_block && vals.priority_block.priority_select && vals.priority_block.priority_select.selected_option && vals.priority_block.priority_select.selected_option.value) || "medium";
      if (subject) {
        const task = createTask({ subject, description, priority });
        if (SLACK_CHANNEL_ID) slackApp.client.chat.postMessage({ channel: SLACK_CHANNEL_ID, text: "Task #" + task.id + " created via Slack: " + task.subject }).catch(() => {});
      }
    });

    await slackApp.start();
    console.log("  Slack Bot: connected (Socket Mode)");
  } catch (e) {
    console.log("  Slack Bot: failed — " + e.message);
    slackApp = null;
  }
}

function buildBoardBlocks(tasks) {
  const pending = tasks.filter((t) => t.status === "pending");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed");
  const total = tasks.length;
  const pct = total ? Math.round((completed.length / total) * 100) : 0;
  const filled = Math.round(pct / 5);
  let bar = ""; for (let i = 0; i < 20; i++) bar += i < filled ? "█" : "░";
  const blocks = [
    { type: "header", text: { type: "plain_text", text: PROJECT_NAME + " kanban" } },
    { type: "section", text: { type: "mrkdwn", text: "*" + completed.length + "* done  ·  *" + inProgress.length + "* in progress  ·  *" + pending.length + "* pending  ·  *" + total + "* total\n`" + bar + "` " + pct + "%" } },
  ];
  if (inProgress.length > 0) {
    blocks.push({ type: "divider" }, { type: "section", text: { type: "mrkdwn", text: ":arrows_counterclockwise:  *In Progress* (" + inProgress.length + ")" } });
    for (const t of inProgress) {
      let line = "> *#" + t.id + "*  " + t.subject;
      if (t.owner) line += "  —  " + t.owner;
      if (t.activeForm) line += "\n>       _" + t.activeForm + "_";
      blocks.push({ type: "section", text: { type: "mrkdwn", text: line } });
    }
  }
  if (pending.length > 0) {
    blocks.push({ type: "divider" }, { type: "section", text: { type: "mrkdwn", text: ":hourglass_flowing_sand:  *Pending* (" + pending.length + ")" } });
    const showPending = pending.length > 8 ? pending.slice(0, 6) : pending;
    const lines = showPending.map((p) => { let pl = "*#" + p.id + "*  " + p.subject; if (p.priority === "high") pl += "  :red_circle:"; if (p.owner) pl += "  —  " + p.owner; return pl; });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } });
    if (pending.length > 8) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "+" + (pending.length - 6) + " more — `" + SLACK_COMMAND + " list`" }] });
  }
  const recentDone = completed.slice(-3);
  if (recentDone.length > 0) {
    blocks.push({ type: "divider" }, { type: "section", text: { type: "mrkdwn", text: ":white_check_mark:  *Recently Done*" } });
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: recentDone.map((d) => "~#" + d.id + "  " + d.subject + "~").join("\n") }] });
  }
  blocks.push({ type: "divider" }, { type: "context", elements: [{ type: "mrkdwn", text: ":keyboard:  `" + SLACK_COMMAND + " list` · `" + SLACK_COMMAND + " add` · `" + SLACK_COMMAND + " ask`" }] });
  return blocks;
}

function buildTaskListBlocks(tasks) {
  const blocks = [{ type: "header", text: { type: "plain_text", text: PROJECT_NAME + " kanban" } }];
  const groups = [
    { key: "in_progress", label: "In Progress" },
    { key: "pending", label: "Pending" },
    { key: "completed", label: "Completed (recent)" },
  ];
  for (const g of groups) {
    let items = tasks.filter((t) => t.status === g.key);
    if (g.key === "completed") items = items.slice(-5);
    if (items.length === 0) continue;
    blocks.push({ type: "divider" }, { type: "section", text: { type: "mrkdwn", text: "*" + g.label + "* (" + items.length + ")" } });
    for (const t of items) {
      let desc = "*#" + t.id + "* " + t.subject;
      if (t.owner) desc += "  " + t.owner;
      if (t.activeForm) desc += "\n_" + t.activeForm + "_";
      blocks.push({ type: "section", text: { type: "mrkdwn", text: desc } });
      const buttons = [];
      if (t.status === "pending") buttons.push({ type: "button", text: { type: "plain_text", text: "Start" }, action_id: "task_start_" + t.id, style: "primary" });
      if (t.status === "in_progress") buttons.push({ type: "button", text: { type: "plain_text", text: "Complete" }, action_id: "task_complete_" + t.id, style: "primary" });
      if (t.status !== "completed") buttons.push({ type: "button", text: { type: "plain_text", text: "Delete" }, action_id: "task_delete_" + t.id, style: "danger" });
      if (buttons.length > 0) blocks.push({ type: "actions", elements: buttons });
    }
  }
  if (blocks.length <= 1) blocks.push({ type: "section", text: { type: "mrkdwn", text: "_No tasks found._" } });
  return blocks;
}

function buildAddTaskModal() {
  return {
    type: "modal", callback_id: "add_task_modal",
    title: { type: "plain_text", text: "New Task" }, submit: { type: "plain_text", text: "Create" },
    blocks: [
      { type: "input", block_id: "subject_block", element: { type: "plain_text_input", action_id: "subject_input", placeholder: { type: "plain_text", text: "Task title" } }, label: { type: "plain_text", text: "Subject" } },
      { type: "input", block_id: "desc_block", optional: true, element: { type: "plain_text_input", action_id: "desc_input", multiline: true, placeholder: { type: "plain_text", text: "Task description" } }, label: { type: "plain_text", text: "Description" } },
      { type: "input", block_id: "priority_block", optional: true, element: { type: "static_select", action_id: "priority_select", initial_option: { text: { type: "plain_text", text: "Medium" }, value: "medium" }, options: [{ text: { type: "plain_text", text: "Low" }, value: "low" }, { text: { type: "plain_text", text: "Medium" }, value: "medium" }, { text: { type: "plain_text", text: "High" }, value: "high" }] }, label: { type: "plain_text", text: "Priority" } },
    ],
  };
}

function handleSlackAsk(question, channelId, client) {
  slackAskActive = true;
  let prompt = buildChatSystemPrompt(readAllTasks(), PROJECT_NAME);
  prompt += "\n\n[User via Slack]: " + question;
  appendOrchestratorHistory("user-slack", question);
  const askEnv = Object.assign({}, process.env);
  delete askEnv.ANTHROPIC_API_KEY;
  const proc = spawn("claude", ["-p", "--output-format", "text", "--model", "sonnet", "--no-session-persistence"], { cwd: REPO_PATH, env: askEnv, stdio: ["pipe", "pipe", "pipe"] });
  proc.stdin.write(prompt); proc.stdin.end();
  let output = "";
  proc.stdout.on("data", (data) => { output += data.toString(); });
  proc.on("close", (code) => {
    slackAskActive = false;
    const targetChannel = channelId || SLACK_CHANNEL_ID;
    if (!targetChannel || !client) return;
    const text = code === 0 && output.trim() ? output.trim().slice(0, 3000) : "(Claude returned exit code " + code + ")";
    appendOrchestratorHistory("orchestrator", text);
    extractAndSaveLearnings(output);
    client.chat.postMessage({ channel: targetChannel, text: "*Claude says:*\n" + text }).catch(() => {});
  });
}

// ── File watch + activity diffing ────────────────────────────────────────────
const taskSnapshot = new Map();
function snapshotTasks(tasks) { for (const t of tasks) taskSnapshot.set(String(t.id), { status: t.status, subject: t.subject, owner: t.owner || "", reportSummary: t.reportSummary || "" }); }
// Collapse a task list to one entry per id (first wins). readAllTasks already
// dedupes, but guard here too so a stray duplicate can never drive a phantom
// status-flip loop through detect/broadcast.
function dedupeById(tasks) {
  const seen = new Map();
  for (const t of tasks) { const id = String(t && t.id); if (!seen.has(id)) seen.set(id, t); }
  return Array.from(seen.values());
}
function detectAndNotifyChanges(tasksIn) {
  const tasks = dedupeById(tasksIn);
  for (const t of tasks) {
    const id = String(t.id);
    const prev = taskSnapshot.get(id);
    if (!prev) {
      logActivity({ type: "created", taskId: id, subject: t.subject, agent: t.agent || t.owner || "", detail: t.priority === "high" ? "Priority: high" : "", description: t.description, priority: t.priority, owner: t.owner, parentId: t.parentId });
    } else if (prev.status !== t.status) {
      if (t.status === "in_progress" && prev.status === "pending") logActivity({ type: "started", taskId: id, subject: t.subject, agent: t.agent || t.owner || "", detail: t.activeForm || "", owner: t.owner, activeForm: t.activeForm, description: t.description });
      else if (t.status === "completed") logActivity({ type: "completed", taskId: id, subject: t.subject, agent: t.agent || t.owner || "", detail: t.reportSummary || "", reportSummary: t.reportSummary, reportPath: t.reportPath, parentId: t.parentId });
      else logActivity({ type: "updated", taskId: id, subject: t.subject, agent: t.agent || t.owner || "", detail: prev.status + " → " + t.status });
    }
  }
  const currentIds = new Set(tasks.map((t) => String(t.id)));
  for (const [id, prev] of taskSnapshot) if (!currentIds.has(id)) logActivity({ type: "deleted", taskId: id, subject: prev.subject || "Unknown", agent: "", detail: "" });
  snapshotTasks(tasks);
}
function watchTasks() {
  if (!fs.existsSync(BOARD_DIR)) fs.mkdirSync(BOARD_DIR, { recursive: true });
  sweepStaleLocks();
  snapshotTasks(readAllTasks());
  // Debounce: fs.watch fires several events per write (and rename → 2 events).
  // Coalesce a burst into one read+detect+broadcast 250ms after it settles.
  let pending = null;
  function onFileChange() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      const tasks = readAllTasks();
      detectAndNotifyChanges(tasks);
      broadcast({ type: "update", tasks });
    }, 250);
  }
  // Watch ONLY this board's own dir — never the parent tasks dir or sibling
  // session/board dirs. One board's write must not wake every other board.
  try { fs.watch(BOARD_DIR, { persistent: false }, () => onFileChange()); } catch (e) { console.error("[watch] fs.watch(" + BOARD_DIR + ") failed:", e && e.code); }
  setInterval(() => broadcast({ type: "update", tasks: readAllTasks() }), 2000);
}

// ── Request body parser ──────────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON")); } });
  });
}

// ── Static assets ────────────────────────────────────────────────────────────
const HTML_PATH = path.join(HARNESS_ROOT, "ui", "kanban.html");
function getHTML() { return fs.readFileSync(HTML_PATH, "utf-8").replace(/\{\{PORT\}\}/g, String(PORT)).replace(/\{\{AREA\}\}/g, String(config.area || "")); }

const STATIC_ROOTS = [path.join(HARNESS_ROOT, "ui"), path.join(HARNESS_ROOT, "playbooks")];
const MIME = { ".css": "text/css", ".js": "application/javascript", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png" };
function serveStatic(req, res) {
  // /styles/foo.css  → ui/styles/foo.css ; /playbooks/foo.html → playbooks/foo.html
  let urlPath = decodeURIComponent((req.url.split("?")[0] || ""));
  if (urlPath === "/" || urlPath === "") return false;
  if (urlPath.includes("..")) return false;
  const candidates = [
    path.join(HARNESS_ROOT, "ui", urlPath.replace(/^\//, "")),
    path.join(HARNESS_ROOT, urlPath.replace(/^\//, "")),
  ];
  for (const file of candidates) {
    if (!STATIC_ROOTS.some((root) => file.startsWith(root))) continue;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(fs.readFileSync(file));
      return true;
    }
  }
  return false;
}

// ── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.url === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    sseClients.add(res);
    res.write("data: " + JSON.stringify({ type: "update", tasks: readAllTasks() }) + "\n\n");
    req.on("close", () => sseClients.delete(res));
    return;
  }

  if (req.url === "/api/tasks" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(readAllTasks())); return;
  }
  if (req.url === "/api/tasks" && req.method === "POST") {
    try { const task = createTask(await parseBody(req)); res.writeHead(201, { "Content-Type": "application/json" }); res.end(JSON.stringify(task)); }
    catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  const putMatch = req.url.match(/^\/api\/tasks\/([\w.-]+)$/);
  if (putMatch && req.method === "PUT") {
    try {
      const task = updateTask(putMatch[1], await parseBody(req));
      if (!task) { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(task));
    } catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  const delMatch = req.url.match(/^\/api\/tasks\/([\w.-]+)$/);
  if (delMatch && req.method === "DELETE") { const ok = deleteTask(delMatch[1]); res.writeHead(ok ? 204 : 404); res.end(); return; }

  // POST /api/tasks/:id/slack  — post a one-off note to Slack for this task
  const slackMatch = req.url.match(/^\/api\/tasks\/([\w.-]+)\/slack$/);
  if (slackMatch && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const t = readAllTasks().find((x) => String(x.id) === slackMatch[1]);
      const prefix = t ? `[#${t.id}] ` : "";
      slackNotify(prefix + (body.text || ""));
      res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}');
    } catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // POST /api/tasks/:id/review  — operator's review decision on an in_review task.
  // body: { action: "approve" | "reject" | "choose" | "feedback", optionId?, text?, by? }
  //  - approve  → status completed; reportSummary gets a "[검토 승인]" line
  //  - reject   → status pending (back to the doer); review.rejectReason = text
  //  - choose   → review.decision = optionId; status completed if that option has `final:true`, else pending
  //  - feedback → appends {ts,by,text} to review.feedback; status unchanged (a comment, not a decision)
  // The task's metadata.review = { what, kind:"approve"|"choose"|"feedback", options?:[{id,label,final?}], … }
  // declares what to review and what action is wanted; the UI renders controls from it.
  const reviewMatch = req.url.match(/^\/api\/tasks\/([\w.-]+)\/review$/);
  if (reviewMatch && req.method === "POST") {
    try {
      const id = reviewMatch[1];
      const body = await parseBody(req);
      const action = String(body.action || "").toLowerCase();
      const by = String(body.by || "운영자").slice(0, 60);
      const text = body.text != null ? String(body.text).trim() : "";
      const cur = readAllTasks().find((x) => String(x.id) === id);
      if (!cur) { res.writeHead(404, { "Content-Type": "application/json" }); res.end('{"error":"Not found"}'); return; }
      if (String(cur.status) !== "in_review") { res.writeHead(409, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "task is not in_review (status=" + cur.status + ")" })); return; }
      const review = Object.assign({}, (cur.metadata && cur.metadata.review) || {});
      const now = new Date().toISOString();
      const upd = { metadata: { review } };  // updateTask merges metadata; `review` here is the full merged object
      let line = "", role = "system";
      if (action === "approve") {
        review.decision = "approved"; review.decidedBy = by; review.decidedAt = now;
        const prev = (cur.reportSummary || "").trim();
        upd.status = "completed";
        upd.reportSummary = prev + (prev ? "\n\n" : "") + `[검토 승인 by ${by}${text ? " — " + text : ""}]`;
        line = `✅ #${id} 검토 승인 by ${by}${text ? " — " + text : ""}`;
      } else if (action === "reject" || action === "return") {
        review.decision = "rejected"; review.rejectReason = text; review.decidedBy = by; review.decidedAt = now;
        upd.status = "pending";
        line = `↩️ #${id} 검토 반려 by ${by}${text ? ": " + text : ""}`;
      } else if (action === "choose") {
        const opts = Array.isArray(review.options) ? review.options : [];
        if (!opts.length) { res.writeHead(400, { "Content-Type": "application/json" }); res.end('{"error":"this task has no review.options to choose from"}'); return; }
        const optId = String(body.optionId || "");
        const opt = opts.find((o) => String(o.id) === optId) || null;
        if (!opt) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "unknown optionId — valid: " + opts.map((o) => o.id).join(",") })); return; }
        review.decision = optId; review.decidedBy = by; review.decidedAt = now;
        upd.status = opt.final ? "completed" : "pending";
        line = `▸ #${id} 검토 선택: ${opt.label || optId} by ${by}`;
      } else if (action === "feedback") {
        if (!text) { res.writeHead(400, { "Content-Type": "application/json" }); res.end('{"error":"feedback text required"}'); return; }
        review.feedback = (Array.isArray(review.feedback) ? review.feedback : []).concat([{ ts: now, by, text }]).slice(-50);
        role = "operator";
        line = `🧑 ${by}: 💬 #${id} 검토 피드백 — ${text}`;
      } else {
        res.writeHead(400, { "Content-Type": "application/json" }); res.end('{"error":"unknown action — approve|reject|choose|feedback"}'); return;
      }
      const task = updateTask(id, upd);
      try {
        opsAppend(role, line, String(id));
        telegramSend(line);
        slackNotify(`[#${id}] ${line}`);
      } catch {}
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(task || { ok: true }));
    } catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // GET /api/harness — current student harness overview
  if (req.url.split("?")[0] === "/api/harness" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(await harnessOverview()));
    return;
  }

  // GET /api/agents  — registry from agents/*.md frontmatter
  if (req.url.split("?")[0] === "/api/agents" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ agents: listAgents() })); return;
  }
  const agentFullMatch = req.url.match(/^\/api\/agents\/([^/]+)\/full$/);
  if (agentFullMatch && req.method === "GET") {
    const a = getAgentFull(decodeURIComponent(agentFullMatch[1]));
    if (!a) { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(a)); return;
  }
  const agentSaveMatch = req.url.match(/^\/api\/agents\/([^/]+)$/);
  if (agentSaveMatch && req.method === "PUT") {
    try {
      const a = saveAgentFull(decodeURIComponent(agentSaveMatch[1]), await parseBody(req));
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(a)); return;
    } catch (e) {
      const status = /not found/.test(e.message) ? 404 : 400;
      res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); return;
    }
  }
  if (req.url.split("?")[0] === "/api/hooks" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ hooks: listHooks() })); return;
  }
  const hookFullMatch = req.url.match(/^\/api\/hooks\/([^/]+)\/full$/);
  if (hookFullMatch && req.method === "GET") {
    const hook = getHookFull(decodeURIComponent(hookFullMatch[1]));
    if (!hook) { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(hook)); return;
  }
  const hookSaveMatch = req.url.match(/^\/api\/hooks\/([^/]+)$/);
  if (hookSaveMatch && req.method === "PUT") {
    try {
      const hook = saveHookFull(decodeURIComponent(hookSaveMatch[1]), await parseBody(req));
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(hook)); return;
    } catch (e) {
      const status = /not found/.test(e.message) ? 404 : 400;
      res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); return;
    }
  }
  if (req.url.split("?")[0] === "/api/skills" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ skills: listSkills() })); return;
  }
  const skillFullMatch = req.url.match(/^\/api\/skills\/([^/]+)\/full$/);
  if (skillFullMatch && req.method === "GET") {
    const skill = getSkillFull(decodeURIComponent(skillFullMatch[1]));
    if (!skill) { res.writeHead(404); res.end('{"error":"Not found"}'); return; }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(skill)); return;
  }
  const skillSaveMatch = req.url.match(/^\/api\/skills\/([^/]+)$/);
  if (skillSaveMatch && req.method === "PUT") {
    try {
      const skill = saveSkillFull(decodeURIComponent(skillSaveMatch[1]), await parseBody(req));
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(skill)); return;
    } catch (e) {
      const status = /not found/.test(e.message) ? 404 : 400;
      res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); return;
    }
  }
  if (req.url.split("?")[0] === "/api/claude-md" && req.method === "GET") {
    try {
      const content = fs.existsSync(CLAUDE_MD_PATH) ? fs.readFileSync(CLAUDE_MD_PATH, "utf-8") : "";
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ path: CLAUDE_MD_PATH, content })); return;
    } catch (e) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); return; }
  }
  if (req.url.split("?")[0] === "/api/claude-md" && req.method === "PUT") {
    try {
      const saved = saveClaudeMd(await parseBody(req));
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(saved)); return;
    } catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); return; }
  }

  // ── Ops Thread (Telegram mirror) ──
  if (req.url.split("?")[0] === "/api/ops-thread" && req.method === "GET") {
    const since = new URL(req.url, "http://localhost").searchParams.get("since") || null;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(readOpsThread(since)));
    return;
  }
  if (req.url === "/api/ops-thread/append" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const role = body.role || "system";
      const text = String(body.text == null ? "" : body.text);
      const msg = opsAppend(role, text, body.taskId != null ? body.taskId : null, { source: body.source });
      // Outbound mirror: anything appended to the Ops Thread goes to Telegram too —
      // except messages that came *from* Telegram (the poller appends those directly,
      // not via this route, but guard anyway to avoid an echo loop). Tag the sender so
      // the bot's relay isn't mistaken for the bot itself.
      if (body.source !== "telegram" && text) {
        const tag = role === "claude" ? "🤖 claude: " : role === "agent" ? "🤖 agent: " : (role === "you" || role === "operator") ? "🧑 운영자: " : "";
        telegramSend(tag + text);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(msg));
    } catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  if (req.url === "/api/ops-thread/send" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const text = String(body.text == null ? "" : body.text);
      const msg = opsAppend("you", text, null, { source: "kanban" });
      // Mirror to Telegram TAGGED — the bot relays it, so without a tag it reads as
      // the bot (an agent). Mark it clearly as the operator's panel message.
      if (text) telegramSend("🧑 운영자: " + text);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(msg));
    } catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  if (req.url === "/api/telegram/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      configured: !!(TELEGRAM.botToken && TELEGRAM.chatId),
      botToken: TELEGRAM.botToken ? "(set)" : "",
      chatId: TELEGRAM.chatId || "",
      polling: !!telegramPollerHandle,
      offset: telegramOffset,
    }));
    return;
  }
  // Convenience: send any DM to your bot, then GET this to see your chat id.
  if (req.url === "/api/telegram/whoami" && req.method === "GET") {
    if (!TELEGRAM.botToken) { res.writeHead(400, { "Content-Type": "application/json" }); res.end('{"error":"TELEGRAM_BOT_TOKEN not set"}'); return; }
    const r = await telegramHttp("getUpdates", { limit: 5 });
    res.writeHead(200, { "Content-Type": "application/json" });
    const chats = (r && r.result || []).map((u) => u.message && u.message.chat).filter(Boolean);
    res.end(JSON.stringify({ ok: r && r.ok, chats }));
    return;
  }

  if (req.url.startsWith("/api/activity") && req.method === "GET") {
    const params = new URL(req.url, "http://localhost").searchParams;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(readActivity(params.get("since") || null, parseInt(params.get("limit")) || 200)));
    return;
  }

  // GET /api/report?path=<filepath>  — read a report file (sandboxed)
  if (req.url.startsWith("/api/report?") && req.method === "GET") {
    const params = new URL(req.url, "http://localhost").searchParams;
    const filePath = params.get("path");
    if (!filePath) { res.writeHead(404, { "Content-Type": "application/json" }); res.end('{"error":"File not found"}'); return; }
    const resolved = path.resolve(filePath.startsWith("/") ? filePath : path.join(REPO_PATH, filePath));
    const allowed = [path.join(os.homedir(), ".claude"), HARNESS_ROOT, REPO_PATH];
    if (!allowed.some((a) => resolved.startsWith(a)) || !fs.existsSync(resolved)) { res.writeHead(403, { "Content-Type": "application/json" }); res.end('{"error":"Access denied"}'); return; }
    try { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ path: resolved, content: fs.readFileSync(resolved, "utf-8") })); }
    catch (e) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  if (req.url === "/api/cli-status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ available: cliAvailable, executing: activeExec ? activeExec.taskId : null, nested: !!process.env.CLAUDECODE }));
    return;
  }

  // ── Orchestrator chat (optional) ──
  const CHAT_FILE = path.join(KANBAN_DIR, "chat-history.json");
  if (req.url === "/api/chat/history" && req.method === "GET") {
    try { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(fs.existsSync(CHAT_FILE) ? JSON.parse(fs.readFileSync(CHAT_FILE, "utf-8")) : [])); }
    catch { res.writeHead(200, { "Content-Type": "application/json" }); res.end("[]"); }
    return;
  }
  if (req.url === "/api/chat/history" && req.method === "PUT") {
    try { const body = await parseBody(req); fs.writeFileSync(CHAT_FILE, JSON.stringify(body.messages || [], null, 2)); res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}'); }
    catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  if (req.url === "/api/chat/history" && req.method === "DELETE") { try { fs.unlinkSync(CHAT_FILE); } catch {} res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}'); return; }
  if (req.url === "/api/orchestrator" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ prompt: readOrchestratorPrompt(), history: readOrchestratorHistory(20), path: ORCHESTRATOR_FILE })); return;
  }
  if (req.url === "/api/orchestrator" && req.method === "PUT") {
    try { const body = await parseBody(req); if (body.prompt) fs.writeFileSync(ORCHESTRATOR_FILE, body.prompt); res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}'); }
    catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  if (req.url === "/api/chat" && req.method === "POST") {
    if (!cliAvailable) { res.writeHead(503, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Claude CLI not available" })); return; }
    try {
      const chatBody = await parseBody(req);
      const chatMessage = chatBody.message || "";
      const chatHistory = chatBody.history || [];
      const chatModel = chatBody.model || "sonnet";
      let chatPrompt = buildChatSystemPrompt(readAllTasks(), PROJECT_NAME);
      if (chatHistory.length > 0) {
        chatPrompt += "## Conversation so far:\n";
        for (let ci = Math.max(0, chatHistory.length - 10); ci < chatHistory.length; ci++) {
          const ch = chatHistory[ci];
          chatPrompt += (ch.role === "user" ? "[User]" : "[Assistant]") + ": " + ch.content + "\n\n";
        }
      }
      chatPrompt += "[User]: " + chatMessage;
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      const chatEnv = Object.assign({}, process.env);
      delete chatEnv.ANTHROPIC_API_KEY;
      const chatProc = spawn("claude", ["-p", "--verbose", "--output-format", "stream-json", "--model", chatModel, "--no-session-persistence"], { cwd: REPO_PATH, env: chatEnv, stdio: ["pipe", "pipe", "pipe"] });
      chatProc.stdin.write(chatPrompt); chatProc.stdin.end();
      let chatBuf = "", rawOut = "", fullResponse = "";
      appendOrchestratorHistory("user", chatMessage);
      chatProc.stdout.on("data", (data) => {
        const chunk = data.toString(); rawOut += chunk; chatBuf += chunk;
        const lines = chatBuf.split("\n"); chatBuf = lines.pop();
        for (const ln of lines) {
          if (!ln.trim()) continue;
          try {
            const json = JSON.parse(ln);
            let text = "";
            if (json.type === "assistant" && json.subtype === "text") text = json.text || "";
            else if (json.type === "assistant" && json.message && json.message.content) json.message.content.forEach((c) => { if (c.type === "text") text += c.text; });
            else if (json.type === "content_block_delta" && json.delta) text = json.delta.text || "";
            if (text) { fullResponse += text; res.write("data: " + JSON.stringify({ type: "chat", chunk: text }) + "\n\n"); }
          } catch {}
        }
      });
      let chatErr = "";
      chatProc.stderr.on("data", (data) => { chatErr += data.toString(); });
      chatProc.on("close", (code) => {
        try {
          if (!rawOut.trim() || code !== 0) res.write("data: " + JSON.stringify({ type: "chat_debug", rawOut: rawOut.slice(0, 2000), stderr: chatErr.slice(0, 2000), exitCode: code }) + "\n\n");
          if (chatErr) res.write("data: " + JSON.stringify({ type: "chat_error", error: chatErr.trim(), exitCode: code }) + "\n\n");
          res.write("data: " + JSON.stringify({ type: "chat_done" }) + "\n\n"); res.end();
          if (fullResponse) { appendOrchestratorHistory("orchestrator", fullResponse); extractAndSaveLearnings(fullResponse); }
        } catch {}
      });
      req.on("close", () => { try { chatProc.kill(); } catch {} });
    } catch (e) { if (!res.headersSent) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message })); } }
    return;
  }
  if (req.url === "/api/exec/stop" && req.method === "POST") {
    const stoppedId = stopExec();
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ stopped: !!stoppedId, taskId: stoppedId }));
    return;
  }

  // Static (CSS / playbooks / etc.)
  if (req.method === "GET" && serveStatic(req, res)) return;

  // HTML dashboard
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(getHTML());
});

checkClaudeCLI();
sweepStaleLocks();
clearStaleExecClaims();   // a crashed board may have left an execClaim with a dead pid
watchTasks();
server.listen(PORT, () => {
  console.log("");
  console.log("  " + PROJECT_NAME + " · agent-kanban-harness");
  console.log("  ─────────────────────────");
  console.log("  http://localhost:" + PORT);
  console.log("  Tasks:   " + TASKS_DIR);
  console.log("  Board:   " + BOARD_DIR + (AGGREGATE_DIRS ? "  (aggregate view: " + AGGREGATE_DIRS.join(", ") + ")" : ""));
  console.log("  App repo:" + REPO_PATH);
  console.log("  Config:  " + (config.configSource || "(none — using defaults)"));
  console.log("  CLI:     " + (cliAvailable ? "ready (claude)" : codexAvailable ? "ready (codex)" : process.env.CLAUDECODE ? "unavailable (nested session)" : "not found") + (config.manualOnly ? " · manualOnly (no auto-exec)" : ""));
  if (TELEGRAM.botToken && TELEGRAM.chatId) console.log("  Telegram: configured (chat=" + TELEGRAM.chatId + ")");
  else console.log("  Telegram: not configured (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)");
  if (config.autoPickup && !config.manualOnly) {
    console.log("  Auto-pickup: on (area=" + (config.area || "*") + ")");
    setInterval(autoPickupTick, 20000);
  } else {
    console.log("  Auto-pickup: off" + (config.manualOnly ? " (manualOnly)" : ""));
  }
  console.log("");
  initSlackBot();
  startTelegramPoller();
});
