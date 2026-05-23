# agent-kanban-harness — 운영 규칙

이 repo는 **kanban board + multi-agent (Claude + Codex) ops/dev harness**입니다. REST API가 있는 kanban server, orchestrator와 specialist agents, incident playbooks, 24h watch/detect loop, subagent runner, pre-deploy gate로 구성됩니다. 애플리케이션 repo(`config.js → repoPath`) 옆에서 실행되며 그 repo를 운전합니다. 애플리케이션 코드를 이 repo에 포함하지 않습니다.

## 응답 언어 — MUST FOLLOW
이 하네스는 한국어 사용자(AI 하네스 6주 완주반 학생·강사)를 대상으로 한다.
**Claude Code, Codex 등 어떤 에이전트 CLI 로 작업하든 사용자에게 보이는 모든
응답·안내·질문·보고는 한국어로 작성한다.** 코드 주석과 git 커밋 메시지는 영어를
써도 되지만, 사람에게 말하는 출력은 한국어를 기본으로 한다.

## Layout

| Path | Purpose |
|---|---|
| `server/kanban.cjs` | Kanban dashboard + REST API + SSE. `npm start`. |
| `ui/` | dashboard HTML + token CSS. |
| `agents/*.md` | Agent definitions. frontmatter(`name`, `mission`, `runner`, `owns`, …) + body. 새 agent는 `_TEMPLATE.md`를 복사. |
| `playbooks/*.html` | 1페이지 incident runbooks. 새 runbook은 `_TEMPLATE.html`에서 시작. |
| `lib/config.cjs` | Config loader. `config.js` 또는 `config.example.js`, `.env`, env override를 읽음. |
| `lib/watch/scheduler.cjs` | 24h watch loop. detector 실행 후 finding을 task로 바꿈. |
| `lib/detect/*` | Monitoring detectors(`sentry`, `vercel`, `_template`) + `rules.json`. |
| `lib/runner/*` | Subagent runner. `claude` / `codex` / `both` / `reviewer:*` adapters, git worktrees, budget. |
| `lib/gate/index.cjs` | Pre-deploy gate. `config.js → deployCommands`를 fail-fast로 실행. |
| `hooks/` | `pre-push.sample`(gate를 git hook으로 설치), `launchd.plist.template`(24h daemon, comment에 cron line 포함). |
| `skills/` | 재사용 Claude Code skill stubs. `/standup`, `/triage`, `/gate`, `/archive`. |
| `docs/` | `the-pattern.md`(왜), `adapting-to-your-project.md`(어떻게), `example-saas.md`(worked case study). |
| `config.example.js` / `config.js` | Per-project config. example을 `config.js`로 복사하며 `config.js`는 gitignored. |
| `.env.example` / `.env` | Tokens(Slack / Sentry / Vercel / Telegram / …). `.env`는 절대 commit하지 않음. |

## 운영 스레드 (Telegram mirror)

dashboard 오른쪽 패널은 operator와 agents가 함께 쓰는 append-only thread입니다. `.env`에 `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`가 있으면 Telegram chat과 양방향으로 미러링합니다. outbound는 `sendMessage`, inbound는 long-poll `getUpdates`를 씁니다.

kanban server는 task create/start/complete 시 `📋 #N` / `▶️ #N` / `✅ #N` 메시지도 양쪽에 올립니다. agents는 `POST /api/ops-thread/append`로 progress를 남깁니다(role: `claude` / `agent` / `system`). operator는 panel input 또는 Telegram reply로 답합니다. token/chatId가 없으면 mirror만 꺼지고 panel은 로컬 thread로 동작합니다. 설정은 README의 "운영 스레드 (Telegram mirror)"를 따른다.

## Server & config

- Start: `npm start` 또는 `node server/kanban.cjs`. 기본 포트는 8080(`PORT` env 또는 `config.js → kanbanPort`).
- API base: `http://localhost:8080/api/`.
- Config resolution: `config.js` → `config.example.js` fallback → env overrides. repo root의 `.env`는 자동 로드됩니다(launchd / cron에서도 token이 보이게 하기 위함).

## Kanban-first instruction protocol — MUST FOLLOW

Every user instruction becomes a kanban task **before** any work starts. This is the orchestrator's first duty (`agents/orchestrator.md`), and it applies to every agent.

학생용 강제 조항: 이 보드에서 이뤄지는 모든 작업은 먼저 칸반 카드(task)로
등록한 뒤 시작한다. Claude Code · Codex 와의 대화로 진행되는 일도 예외 없이
카드가 된다. 카드 없이 시작하지 않는다. 이 규칙은 setup --guided 가 운전 대상
repo(`config.js → repoPath`)에 심는 CLAUDE.md 규칙 블록과 동일하다. 하네스는 AI를 묶어두는 고삐, 즉 설계+파일+
절차의 묶음이며, 칸반 카드는 그 고삐가 실제로 작동하는 첫 단추다.

1. 지시를 받으면 `POST /api/tasks` — `{ subject, description, agent, metadata.runner, priority }`. 지시 원문을 `description`에 남긴다.
2. `agents/orchestrator.md`의 routing rules에 따라 `agent` / `metadata.runner` / `priority`를 정한다.
3. task를 `in_progress`로 옮긴 뒤에야 작업을 시작한다.
4. 완료 시 `reportPath` + `reportSummary`를 남기고 `completed`로 옮긴다.
5. 시작 / 핵심 진행 / 완료는 raw webhook이 아니라 `POST /api/tasks/{id}/slack`로 보고한다.

**Exception — incident response**: production-impacting incident 또는 1-line, obviously-reversible hotfix는 즉시 처리할 수 있다. 단 1시간 안에 `metadata.source = "incident-response"`가 붙은 post-hoc task를 만들고, 수행한 일과 후속 조치를 남긴다. 그 외 refactors, docs, features, ordinary bugs는 모두 step 1부터 따른다. `docs/the-pattern.md` → "Kanban-first" 참고.

**Exception — bootstrap**: 하네스 자체를 세우는 부트스트랩 명령 — `init`, `setup`,
`start`, `update`, `doctor` — 은 보드가 아직 없거나 막 생성된 시점이라 사전 task
등록 대상이 아니다. `init` 이 등록하는 seed task `#1` "이 보드 셋업하기"가 그
역할을 대신한다. 부트스트랩 이후의 모든 작업은 step 1 부터 따른다.

## Task lifecycle & API

States: `pending` → `in_progress` → `in_review` → `completed`. status transition은 orchestrator만 쓴다. `completed`에는 `reportPath` + `reportSummary`가 필요합니다.

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/tasks` | — | List all tasks |
| POST | `/api/tasks` | `{ subject, description, agent?, priority?, metadata? }` | Create |
| PUT | `/api/tasks/:id` | `{ status?, reportPath?, reportSummary?, metadata?, ... }` | Update |
| DELETE | `/api/tasks/:id` | — | Delete |
| POST | `/api/tasks/:id/slack` | `{ text }` | Post a note to Slack for this task |
| GET | `/api/agents` | — | Agent registry (from `agents/*.md` frontmatter) |
| GET | `/api/agents/:name/full` | — | One agent's full definition |
| GET | `/api/activity?since=&limit=` | — | Activity log |
| GET | `/events` | — | SSE stream of board updates |

## Multi-agent cross-validation

- `runner: claude` / `codex` — single model. 결정적·기계적 작업용.
- `runner: reviewer:codex` — Claude가 구현하고 Codex가 검토. 구현 작업 기본값.
- `runner: both` — Claude + Codex가 독립 실행 후 diff. disagreement는 "needs human" column으로 이동. migrations, access-control, money paths 같은 high-stakes work에 사용. 불일치가 안전장치입니다.
- Auto-promote: severity ≥ `CROSS_VALIDATION_THRESHOLD`면 single-model이 `both`로 승격될 수 있습니다.
- second model 일일 cap은 `DAILY_CODEX_BUDGET`, fallback chain은 `MODEL_FALLBACK_CHAIN`.

자세한 내용은 `docs/the-pattern.md` → "Cross-validation"을 본다.

## Selvedge boundaries

각 agent는 `config.js → repoPath` 기준 `owns:` glob을 선언합니다. agent는 자기 영역 안에 머물고 orchestrator는 ownership으로 라우팅합니다. shared types, dependency manifests, migrations 같은 공유 표면은 cross-check가 필요하며, 이때 `runner: both`가 의미를 갖습니다. `owns:` glob은 가능하면 겹치지 않게 유지합니다.

## Pre-deploy gate

`lib/gate/index.cjs`는 `config.js → repoPath`에서 `config.js → deployCommands`를 직렬·fail-fast로 실행하고, 선택적으로 bundle-size inspection을 수행합니다. `hooks/pre-push.sample`은 `git push` 때 gate를 실행합니다. 실패하면 push를 막고 "needs human" task를 자동 생성합니다. 유일한 우회는 `git push --no-verify` 또는 `KANBAN_GATE_BYPASS=1 git push`이며, 후자는 `data/runs/overrides.jsonl`에 기록되어 standup에서 검토됩니다.

## Absolute rules

1. gate 통과 또는 감사 가능한 override 없이 ship하지 않는다.
2. main branch를 force-push하지 않는다.
3. `.env` 또는 `config.js`를 commit하지 않는다. 둘 다 gitignored 상태를 유지한다.
4. selvedge boundary를 넘지 않는다. agent는 자신이 `owns`하는 영역만 편집한다.
5. plaintext secret을 `data/`, logs, committed files에 저장하지 않는다. `.env`를 사용한다.
6. user instruction은 먼저 kanban task로 등록한다. 예외는 incident-response뿐이다.
7. `runner: both` disagreement는 auto-merge하지 않는다. 사람이 결정한다.
