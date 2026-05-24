# agent-kanban-harness를 내 프로젝트에 맞추기

이 하네스는 generic template으로 배포됩니다. 여러분의 front-end / back-end repo를 운전하려면 몇 개 파일만 바꾸면 됩니다. 특정 framework에 묶이지 않으며, 아래 예시는 흔한 stack을 보여줄 뿐 전체 구조는 같습니다.

전제 조건: Node ≥ 20, 애플리케이션 git repo, 그리고 runner가 실제 작업을 실행하게 하려면 PATH에 `claude` 또는 `codex` CLI가 있으면 좋습니다. CLI가 없어도 runner는 deterministic stub verdict로 fallback하므로 실습은 가능합니다.

---

## Step 1 — `config.js`: repo, goal, stack을 지정한다

```bash
cp config.example.js config.js     # config.js is gitignored
cp .env.example .env               # fill in tokens; .env is gitignored
```

`config.js`에서 설정할 항목:

- `projectName` — 보드 UI와 Slack에 보이는 이름.
- `goal` — 1주차에 고른 **타겟 업무 1개**. 6주 후 무엇을 달성할지 적습니다.
- `repoPath` — 애플리케이션 repo의 **절대경로**. gate 명령과 runner worktree가 여기서 실행됩니다.
- `kanbanPort` — 기본 8080. env `PORT`가 있으면 우선합니다.
- `deployCommands` — gate가 순서대로 실행할 build/test chain. fail-fast입니다.

```js
// Node / Vite
[{ name:"01-typecheck", cmd:"npx", args:["tsc","--noEmit"] },
 { name:"02-build",     cmd:"npm", args:["run","build"] }]

// Rust
[{ name:"build", cmd:"cargo", args:["build","--release"] },
 { name:"test",  cmd:"cargo", args:["test"] }]

// Go
[{ name:"vet",  cmd:"go", args:["vet","./..."] },
 { name:"test", cmd:"go", args:["test","./..."] }]

// Python
[{ name:"lint",  cmd:"ruff", args:["check","."] },
 { name:"test",  cmd:"pytest", args:["-q"] }]
```

E2E가 있다면 Playwright golden-path spec 같은 단계를 추가하세요.

- `buildOutputDir` — bundle-size regression을 볼 build output 디렉토리(`dist`, `build`, `.next` 등). 건너뛰려면 `null`.

---

## Step 2 — `agents/`: ownership을 실제 디렉토리에 맞춘다

`agents/frontend-agent.md`와 `agents/backend-agent.md`의 frontmatter에서 `owns:` glob을 실제 코드 위치에 맞춥니다. orchestrator는 "이 task가 이 파일을 건드린다" → "이 agent가 맡는다"를 이 glob으로 판단합니다.

```text
# frontend-agent owns 예시
Next.js / CRA:  app/**, src/app/**, components/**, pages/**, styles/**, public/**
Vite + React:   src/**, src/components/**, src/pages/**, src/styles/**, src/locales/**
SvelteKit:      src/routes/**, src/lib/components/**, static/**

# backend-agent owns 예시
Node API:       server/**, api/**, src/server/**, src/api/**
Rails:          app/controllers/**, app/models/**, db/migrate/**
Go services:    internal/**, cmd/**
Supabase:       supabase/functions/**, supabase/migrations/**
```

가능하면 ownership은 **겹치지 않게** 둡니다. 역할이 더 필요하면 `agents/_TEMPLATE.md`를 `agents/<name>.md`로 복사하고 frontmatter의 `name`, `mission`, `runner`, `owns`를 채운 뒤 `config.js → agents`에 추가합니다.

`orchestrator.md`, `deploy-gate-agent.md`, `monitor-agent.md`, `reviewer-codex.md`는 대부분 generic하게 유지해도 됩니다. 프로젝트에 맞지 않는 문장만 줄이세요.

---

## Step 3 — `lib/detect/`: 모니터링을 연결하거나 비워둔다

`config.js → detectors`는 24h watch loop에서 실행할 detector 목록입니다. 기본 제공:

- **`sentry`** — error group과 error-rate spike. `.env`에 `SENTRY_AUTH_TOKEN`, `SENTRY_ORG_SLUG`, `SENTRY_PROJECT_SLUG` 필요.
- **`vercel`** — deploy state. `.env`에 `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, team 계정이면 `VERCEL_TEAM_ID` 필요.

env var가 비어 있으면 crash하지 않고 "config missing" low-severity task를 만듭니다.

Datadog, CloudWatch, Prometheus, `/healthz`, custom metrics API를 쓰려면 `lib/detect/_template.cjs`를 `lib/detect/<name>.cjs`로 복사하고 `run(ruleSet, state)`를 구현합니다. `lib/watch/scheduler.cjs` 상단의 detector map에 등록하고, `lib/detect/rules.json`에 rule block을 추가한 뒤 `config.js → detectors`에서 켭니다.

모니터링이 없으면 `detectors`를 비워두면 됩니다. 나머지는 그대로 동작합니다.

---

## Step 4 — `agents/deploy-gate-agent.md` + `lib/gate/`: build/test 명령을 고정한다

gate는 코드 변경 없이 `config.js → deployCommands`를 실행합니다. `agents/deploy-gate-agent.md`의 설명이 여러분의 stack과 맞는지만 검토하세요. gate stage는 직렬·fail-fast로 돌고, 실패 stage log는 `data/runs/gate-<ts>/<stage>.log`에 저장됩니다. 실패하면 "needs human" task가 자동 생성됩니다.

---

## Step 5 — `playbooks/`: 실제 incident마다 1페이지씩 만든다

`playbooks/_TEMPLATE.html`에서 시작합니다. 기본 예시(`build-fail`, `e2e-regression`, `sentry-spike`, `deploy-rollback`)를 바꾸고, payment webhook failure, queue backlog, third-party outage처럼 실제 시스템에 있는 상황을 추가하세요.

playbook은 압박 중에 읽히므로 한 페이지로 유지합니다. monitor agent는 anomaly를 task로 라우팅하고, 그 task에서 관련 playbook을 링크합니다.

---

## Step 6 — `hooks/`: pre-push gate와 watch schedule을 설치한다

**Pre-push gate** — `config.js → repoPath`가 가리키는 애플리케이션 repo에 설치합니다.

```bash
ln -sf /abs/path/to/agent-kanban-harness/hooks/pre-push.sample /abs/path/to/your-app/.git/hooks/pre-push
chmod +x /abs/path/to/agent-kanban-harness/hooks/pre-push.sample
export AGENT_KANBAN_HARNESS_DIR=/abs/path/to/agent-kanban-harness   # hook이 harness를 찾기 위한 값
```

이제 `git push`가 gate를 실행합니다. 사람은 `KANBAN_GATE_BYPASS=1 git push`로 우회할 수 있고, 이 기록은 `data/runs/overrides.jsonl`에 남습니다.

**24h watch**

- macOS: `hooks/launchd.plist.template`의 `__PLACEHOLDER__` 3개를 바꾸고 `~/Library/LaunchAgents/`에 복사한 뒤 `launchctl load`.
- Linux / cron: template 상단 comment에 있는 cron line(`*/5 * * * * … scheduler.cjs --once`)을 등록.

---

## Step 7 (optional) — Slack reporting

Slack app(bot + app token, Socket Mode)을 만들고 `.env`에 `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_CHANNEL_ID`를 넣습니다. `SLACK_COMMAND` 기본값은 `/kanban`입니다.

연결되면 board가 start / progress / done update를 올리고 slash command(`/kanban board`, `/kanban list`, `/kanban add`, `/kanban ask`, `/kanban exec`, `/kanban stop`)가 동작합니다. 비워두면 Slack만 꺼지고 나머지는 계속 동작합니다.

---

## 실행

```bash
npm install
npm start          # → http://localhost:8080
```

Slack/Telegram 미러를 쓰지 않는다면 `npm install` 없이도 core board, init, setup, gate는 동작합니다.

보드를 열고 UI 또는 `POST /api/tasks`로 task를 만들어 보세요. `npm run gate`를 실행하고, `npm run watch:once`로 watch sweep을 한 번 돌립니다. 왜 이런 구조인지 궁금하면 `docs/the-pattern.md`, 전체 예시는 `docs/example-saas.md`를 보세요.
