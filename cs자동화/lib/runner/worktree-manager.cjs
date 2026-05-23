/**
 * Git worktree manager — gives each parallel agent run its own working copy.
 *
 * Worktrees live at <repo-root>/data/worktrees/task-<id>-<runner>-<ts>/
 * Branches are named  kanban/task-<id>-<runner>-<ts>
 * Cleanup happens after the task completes (success or failure).
 *
 * The git repo the worktrees branch off is config.repoPath — the application
 * repo this harness drives — not the harness checkout itself.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const config = require("../config.cjs");

const REPO = config.repoPath;                                   // the app repo
const WT_DIR = path.join(config.repoRoot, "data", "worktrees"); // worktrees stored here

function ts() { return Date.now().toString(36); }
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function q(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
function git(cmd, opts = {}) { return execSync(cmd, { cwd: REPO, encoding: "utf-8", ...opts }); }

function createWorktree(taskId, runner) {
  ensureDir(WT_DIR);
  const tag = `${taskId}-${runner}-${ts()}`;
  const wtPath = path.join(WT_DIR, `task-${tag}`);
  const branch = `kanban/task-${tag}`;
  if (fs.existsSync(wtPath)) {
    try { git(`git worktree remove --force ${q(wtPath)}`); } catch {}
    try { fs.rmSync(wtPath, { recursive: true, force: true }); } catch {}
  }
  git(`git worktree add -b ${q(branch)} ${q(wtPath)} HEAD`);
  return { branch, path: wtPath, taskId, runner, createdAt: new Date().toISOString() };
}
function removeWorktree(wt) {
  if (!wt || !wt.path) return;
  try { git(`git worktree remove --force ${q(wt.path)}`); } catch {}
  // Branch cleanup is optional — leave it for git gc.
}
function listWorktrees() {
  let out = "";
  try { out = git("git worktree list --porcelain"); } catch { return []; }
  return out.split("\n\n").filter(Boolean).map((b) => {
    const wt = {};
    for (const l of b.split("\n")) {
      const [k, ...rest] = l.split(" ");
      if (k === "worktree") wt.path = rest.join(" ");
      else if (k === "branch") wt.branch = rest.join(" ").replace("refs/heads/", "");
      else if (k === "HEAD") wt.head = rest.join(" ");
    }
    return wt;
  }).filter((wt) => wt.path && wt.path.startsWith(WT_DIR));
}
function cleanupOrphans(maxAgeHours = 24) {
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000;
  let removed = 0;
  for (const wt of listWorktrees()) {
    try { if (fs.statSync(wt.path).mtimeMs < cutoff) { removeWorktree(wt); removed++; } } catch {}
  }
  return removed;
}

module.exports = { createWorktree, removeWorktree, listWorktrees, cleanupOrphans, WT_DIR };
