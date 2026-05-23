/**
 * agent-kanban-harness — per-project configuration.
 *
 * Copy to config.js and edit. config.js is gitignored — keep it out of version
 * control if it contains anything you would not want public. (Tokens belong in
 * .env, not here.)
 *
 * Everything here is read by:
 *   - server/kanban.cjs   (port, projectName, slack, repoPath)
 *   - lib/gate/index.cjs  (repoPath, deployCommands)
 *   - lib/runner/*        (repoPath for git worktrees, agents)
 *   - lib/watch + detect  (detectors)
 */
module.exports = {
  // Display name for the board UI + Slack messages.
  projectName: "My Project",

  // goal = 1주차에 고른 "타겟 업무 1개".
  // 이번 6주 동안 / 이 프로젝트로 무엇을 완성할지 적는다.
  goal: "6주 후 — 주간 보고서 자동 생성 자동화 1개 완성",

  // Absolute path to the application repo this harness drives.
  // The gate runs build/test commands here; runners create git worktrees here.
  repoPath: "/absolute/path/to/your/app-repo",

  // 골든 데이터 = 이상적 입력+출력. setup --guided 가 물어본다.
  // 교안 기본 구조: golden/input-example.md + golden/output-example.md
  goldenDir: "golden/",

  // Port for the kanban dashboard. Env var PORT overrides this.
  kanbanPort: 8080,

  // Sub-directory under the tasks dir that holds THIS board's task JSON files.
  // If unset, the server uses this harness directory name (for `init my-board`,
  // tasks live under <tasksDir>/my-board/<id>.json). Final fallback is "kanban".
  // The tasks dir is ~/.claude/tasks by default, or KANBAN_TASKS_DIR if set
  // (handy for tests / running boards off a throwaway dir).
  //
  // IMPORTANT — when several boards share one tasks dir: give each board a
  // *distinct* boardDir. The kanban server reads / writes / fs.watches ONLY its
  // own boardDir; it never scans sibling dirs or Claude-Code session UUID dirs.
  // (This is the fix for the multi-board file-watch amplification + duplicate-id
  // runaway: one board's write must not wake every other board.)
  // boardDir: "my-board",

  // Meta-board aggregate read mode (optional). Set to an array of board-dir
  // names under the tasks dir — e.g. ["kanban","camp-lms"] — and this board
  // *displays* the tasks from all of them together (deduped by id; if the same
  // id appears in two dirs, the one from the dir listed first wins). This is
  // read-only for display: writes (create / update / delete) still go to this
  // board's own boardDir only. An `_orchestrator`-style meta board that wants to
  // see every area's tasks in one view sets this to the area board-dir names.
  // null / unset ⇒ ordinary single-board mode (only boardDir is read).
  // aggregateDirs: ["kanban", "camp-lms"],

  // Commands the pre-deploy gate runs, in order, from repoPath. Fail-fast.
  // Empty = the gate is a no-op pass — fill this in for your stack. Examples:
  //   Node/Vite:   [{ name: "01-typecheck", cmd: "npx", args: ["tsc", "--noEmit"] },
  //                 { name: "02-build",     cmd: "npm", args: ["run", "build"] }]
  //                 // optional E2E:  { name: "03-e2e", cmd: "npx", args: ["playwright","test","e2e/golden-path.spec.ts","--reporter=list"] }
  //   Rust:        [{ name: "01-build", cmd: "cargo", args: ["build", "--release"] },
  //                 { name: "02-test",  cmd: "cargo", args: ["test"] }]
  //   Go:          [{ name: "01-vet",   cmd: "go", args: ["vet", "./..."] },
  //                 { name: "02-test",  cmd: "go", args: ["test", "./..."] }]
  //   Python:      [{ name: "01-lint",  cmd: "ruff", args: ["check", "."] },
  //                 { name: "02-test",  cmd: "pytest", args: ["-q"] }]
  deployCommands: [],

  // The built-output directory the gate inspects for bundle-size deltas.
  // Set to null to skip bundle inspection.
  buildOutputDir: "dist",

  // Specialist agents the orchestrator can route to. The `owns` globs are
  // relative to repoPath and are used for "which agent owns this file?" routing.
  // Edit these to match your directory layout.
  agents: [
    {
      name: "orchestrator",
      def: "agents/orchestrator.md",
      runner: "claude",
    },
    {
      name: "frontend-agent",
      def: "agents/frontend-agent.md",
      runner: "reviewer:codex",
      owns: ["src/**", "app/**", "components/**", "pages/**", "styles/**", "public/**"],
    },
    {
      name: "backend-agent",
      def: "agents/backend-agent.md",
      runner: "both",
      owns: ["server/**", "api/**", "db/**", "migrations/**", "lib/**", "functions/**"],
    },
    {
      name: "deploy-gate-agent",
      def: "agents/deploy-gate-agent.md",
      runner: "reviewer:codex",
      owns: [".git/hooks/pre-push"],
    },
    {
      name: "monitor-agent",
      def: "agents/monitor-agent.md",
      runner: "codex",
    },
  ],

  // Auto-pickup (optional — content-line boards). When `autoPickup: true`, the
  // kanban server runs a 20s loop that grabs the highest-priority pending task
  // and flips it to in_progress (which fires the auto-executor) — one at a time,
  // skipped while a task is already executing. `area` (e.g. "01", "02a") scopes
  // the loop to tasks whose `metadata.area` or `project` matches; null ⇒ no
  // filter. Leave both unset on boards that should not self-feed work.
  // area: "01",
  // autoPickup: true,

  // Orchestration-only boards: never auto-execute (no spawn-on-in_progress, no
  // auto-pickup) — work is started deliberately, not fire-and-forget. Leave unset
  // (false) on normal boards.
  // manualOnly: true,

  // Monitoring detectors to run on the 24h watch loop. Each maps to a module in
  // lib/detect/. Add { detector: "<name>", enabled: true } and provide the
  // matching env vars (see .env.example). No monitoring? Leave this empty —
  // copy lib/detect/_template.cjs to write your own.
  detectors: [
    { detector: "sentry", enabled: false },
    { detector: "vercel", enabled: false },
  ],

  // ── In_review tasks: declare what to review + the post-review action ──────────
  // When a task goes to `in_review`, give it `metadata.review` so the board UI can
  // show *what* needs checking and *what decision* is wanted (instead of just sitting
  // there). The operator acts via `POST /api/tasks/:id/review`:
  //   metadata.review = {
  //     what: "이 문항 3개의 답안키가 전부 B인 게 의도인지 검토 — 의도면 OK, 우연이면 재배치",
  //     kind: "approve"            // ✅ 승인(→completed) / ↩️ 반려(→pending)
  //         | "choose"             // 옵션 중 선택: options:[{id,label,final?:bool}]  (final ⇒ completed, else pending)
  //         | "feedback",          // (주관식 피드백은 kind와 무관하게 항상 가능 — 코멘트만 남기고 상태 안 바꿈)
  //     options: [ { id: "a", label: "그대로 진행", final: true }, { id: "b", label: "01로 반려 — 재배치" } ],
  //   }
  // (runtime fields the endpoint writes: decision, decidedBy, decidedAt, rejectReason, feedback:[{ts,by,text}])

  // Slack reporting (optional). Tokens come from .env, not here.
  slack: {
    command: "/kanban",
  },

  // Telegram Ops Thread mirror (optional). botToken + chatId come from .env;
  // these are knobs you may want to override per-project. Empty token/chatId
  // ⇒ the right-side Ops Thread panel still works locally; nothing is sent
  // to Telegram and no inbound polling happens.
  telegram: {
    // allowedChatIds: ["6131488858"],  // optional allowlist; empty ⇒ chatId only
    pollEnabled: true,
    pollIntervalMs: 1500,
  },
};
