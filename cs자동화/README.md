# agent-kanban-harness

**AI 하네스 6주 완주반 3주차+ 도구**입니다. 1·2주차 이후부터 학생 프로젝트 옆에서 평가 시스템·자동화·운영을 배우는 독립 칸반 하네스입니다.

## 처음이신가요?

이 패키지는 여러분의 앱 코드 자체가 아니라, 그 옆에서 AI 작업을 카드·에이전트·검증 절차로 묶어두는 학생용 하네스입니다.
3주차부터 사용합니다. 1주차에 고른 **타겟 업무 1개**를 `goal`로 적고, 6주 동안 그 업무 자동화를 완성하는 흐름입니다.
설치는 아래 설치 프롬프트 한 블록을 Claude Code 또는 Codex CLI에 붙여넣으면 됩니다.
`init`의 이름은 단순 폴더명이 아니라 **프로젝트 이름**이며, 동시에 이 보드의 `boardDir` 격리 키입니다.
영문 소문자/하이픈 이름을 권장합니다. 예: `npx agent-kanban-harness init my-todo-app`
보드가 뜨면 첫 카드 `#1`에서 `setup --guided`를 진행하세요.

## 설치 프롬프트 (Claude Code / Codex)

Claude Code 또는 Codex CLI에 아래 프롬프트를 그대로 붙여넣으세요.

```text
이 repo는 agent-kanban-harness입니다. AI 하네스 6주 완주반 3주차+ 도구입니다.
먼저 README와 CLAUDE.md를 읽으세요. 사용자에게 보이는 모든 응답은 한국어로 합니다.

설치 절차:
1. 보드가 아직 없으면: npx agent-kanban-harness init my-todo-app 를 실행하세요.
   여기서 my-todo-app은 프로젝트 이름이며 boardDir 격리 키입니다.
2. 로컬 칸반 서버를 반드시 background 로 실행하세요 — foreground 로 실행하면
   명령이 끝날 때 서버도 함께 종료됩니다:
     npx agent-kanban-harness start
3. 서버가 뜨면 http://localhost:8080 보드 URL을 사용자에게 알려주세요.
4. 보드의 첫 task(#1) "이 보드 셋업하기"를 in_progress 로 옮기고,
   setup --guided 로 다음 5가지를 사용자와 함께 정의하세요.
   - 이 하네스가 운전할 프로젝트 절대경로(repoPath)
   - 골든 데이터 위치(golden/ 폴더, 없으면 비워둠)
   - 에이전트 구성(필요한 specialist agent)
   - 평가 루프 레벨(single-model / review / cross-validation)
   - goal: 1주차에 고른 타겟 업무 1개. 6주 후 무엇을 달성할지

■ 절대 규칙 — 이 세션 내내 적용
이 설치 이후, 내가 무슨 작업을 시키든(코드 작성·파일 생성·에이전트 세팅·
리팩터 등 무엇이든) 너는 먼저 http://localhost:8080/api/tasks 에 칸반
task(카드)를 POST 로 등록하고, in_progress 로 옮긴 다음에야 작업을 시작한다.
작업이 끝나면 reportSummary 를 남기고 completed 로 옮긴다.
카드 없이 시작하지 않는다. "간단해서" "바로 해달라고 해서"는 예외가 아니다.
이건 이 보드의 절대 규칙이며, 이 세션 동안 모든 지시에 적용된다.

하네스 = AI를 묶어두는 고삐 = 설계+파일+절차의 묶음입니다.
CLAUDE.md는 마스터 프롬프트입니다.
Claude=컨설턴트(기획·검토), Codex=신입개발자(파일작업) 역할로 운영하세요.
```

## 학생 설치 워크플로우

권장 흐름은 **GitHub Template → 본인 repo → commit → update** 입니다.

1. GitHub에서 **Use this template** → 본인 계정에 새 repo 생성
2. 로컬 clone 후 Claude Code 설치 프롬프트 실행
3. `setup --guided` 결과를 확인하고 첫 commit
4. 강사 버전이 올라오면 `npx agent-kanban-harness update --diff` 후 필요한 변경만 반영

코어 기능(보드·init·setup·gate)은 의존성 설치 없이 동작합니다. `npm install`은 Slack/Telegram 미러를 쓸 때만 board 폴더에서 1회 실행하면 됩니다.

기존 npx 설치도 계속 지원합니다.

## 이 도구가 하는 일

`agent-kanban-harness`는 Claude + Codex 같은 여러 AI 작업자를 칸반 보드 위에서 운영하기 위한 템플릿입니다. 사람의 지시는 먼저 task가 되고, orchestrator가 specialist agent와 검증 수준을 정합니다. 작업은 분리된 git worktree에서 실행되고, pre-deploy gate가 build/test 실패를 막으며, 24h watch loop가 모니터링 이상을 task로 바꿉니다.

이 하네스는 애플리케이션 repo 안에 앱 코드를 포함하지 않습니다. `config.js → repoPath`가 가리키는 프로젝트를 **옆에서 운전**합니다.

## 설치

### A. GitHub Template 방식

1. **[github.com/Zakedu/agent-kanban-harness](https://github.com/Zakedu/agent-kanban-harness)**에서 **Use this template** → **Create a new repository**를 누릅니다.
2. 새 repo를 clone한 뒤 [빠른 시작](#빠른-시작)으로 진행합니다.

```bash
gh repo create my-todo-app --template Zakedu/agent-kanban-harness --private --clone
cd my-todo-app
```

### B. npx CLI 방식

```bash
npx agent-kanban-harness init my-todo-app
```

`my-todo-app`은 프로젝트 이름입니다. 이 이름으로 `./my-todo-app` 보드 디렉토리가 생기고, 같은 값이 `boardDir` 격리 키로 쓰입니다. 영문 소문자/하이픈을 권장합니다.

`init` 한 번이면 보드를 scaffold하고, 첫 칸반 task(`#1`)를 등록하고, 로컬 칸반 서버를 실행해 `http://localhost:8080` 보드를 엽니다. 이후 `setup`은 보드의 task `#1`에서 Claude Code와 함께 진행하면 됩니다.

서버 없이 scaffold만 하려면 `--no-start`를 붙입니다.

```bash
npx agent-kanban-harness init my-todo-app --no-start
```

패키지에서 바로 실행할 수 있는 명령:

```bash
npx agent-kanban-harness start          # 칸반 서버 실행
npx agent-kanban-harness watch          # 24h watch scheduler 실행
npx agent-kanban-harness gate           # pre-deploy gate 실행
npx agent-kanban-harness setup --guided # config.js + agents/*.md 생성
npx agent-kanban-harness doctor         # CLI/config/privacy 준비 상태 점검
npx agent-kanban-harness whoami         # Telegram chat id 확인
npx agent-kanban-harness --version
```

### npm publish (maintainer only)

```bash
# bump version first
npm version patch   # or minor / major

npm publish --access public
```

`npm publish`는 `npm login` 상태와 `Zakedu/agent-kanban-harness` push 권한이 필요합니다. 실제 tarball에 들어가는 파일은 `package.json`의 `files` 필드가 결정합니다.

## 아키텍처

```
                                  ┌─────────────────────────────┐
   you / Slack / API ──────────▶  │  kanban server (REST + SSE) │  ◀── browser dashboard
                                  │  server/kanban.cjs · ui/    │
                                  └──────────────┬──────────────┘
                                                 │ tasks
                                       ┌─────────▼─────────┐
                                       │   orchestrator    │  owns globs 기준 라우팅,
                                       │  agents/orch...md │  runner 설정, 상태 전이 관리
                                       └─────────┬─────────┘
                       ┌─────────────────────────┼─────────────────────────┐
              ┌────────▼───────┐  ┌──────────────▼─────┐  ┌────────────────▼──────┐  ┌───────────▼────────┐
              │ frontend-agent │  │   backend-agent    │  │  deploy-gate-agent    │  │   monitor-agent    │
              │  pages, UI,    │  │  API, DB, migra-   │  │  build/test gate      │  │  Sentry / Vercel   │
              │  routing, i18n │  │  tions, authz      │  │  before deploy        │  │  / custom signals  │
              └────────────────┘  └────────────────────┘  └───────────┬───────────┘  └─────────┬──────────┘
                       │                    │                         │                        │
                  reviewer:codex       runner: both              hard gate                  anomalies → tasks
                  (Claude 작업,         (Claude + Codex          (hooks/pre-push.sample)   (lib/watch + lib/detect)
                   Codex 검토)          독립 실행 후 diff)
                       └────────────────────┴──── lib/runner (claude/codex/both/reviewer adapters, git worktrees, budget) ────┘

   incident? ──▶ playbooks/*.html  (trigger → diagnose → decision tree → escalate → aftermath)
```

- **kanban server** (`server/kanban.cjs` + `ui/`) — 4컬럼 보드(pending / in_progress / in_review / completed), REST API, SSE live updates, `agents/*.md` 기반 agent registry, 선택 Slack bot.
- **orchestrator** (`agents/orchestrator.md`) — 모든 지시를 task로 만들고, `owns` glob과 severity로 agent/runner를 정하며, 상태 전이를 관리합니다. 앱 코드는 직접 수정하지 않습니다.
- **specialist agents** (`agents/frontend-agent.md`, `backend-agent.md`, `deploy-gate-agent.md`, `monitor-agent.md`, `reviewer-codex.md`) — repo의 영역을 나눠 맡고 기본 `runner`를 선언합니다. 추가 역할은 `_TEMPLATE.md`를 복사합니다.
- **playbooks** (`playbooks/*.html`) — 장애 상황을 빠르게 읽는 1페이지 runbook입니다.
- **watch + detect** (`lib/watch/scheduler.cjs`, `lib/detect/*`) — `sentry`, `vercel`, 커스텀 detector를 돌려 발견 사항을 task로 올립니다.
- **runner** (`lib/runner/*`) — `claude` / `codex` CLI를 분리 worktree에서 실행하고, `runner: both` 결과를 비교합니다.
- **gate** (`lib/gate/index.cjs`) — `config.js → deployCommands`를 fail-fast로 실행하고, 실패 시 사람검토 task를 만듭니다.

## 빠른 시작

**A. npx**

```bash
npx agent-kanban-harness init my-todo-app
```

`init`은 프로젝트 이름으로 보드 디렉토리를 만들고, 첫 task(`#1`)를 등록한 뒤 서버를 실행합니다. 서버 없이 scaffold만 하려면 `--no-start`를 붙입니다.

scaffold 중 바로 인터뷰까지 진행하려면:

```bash
npx agent-kanban-harness init my-todo-app --guided --repo /absolute/path/to/app
```

`setup --guided`는 local `claude`와 `codex` CLI를 감지합니다. 사용 가능하면 패키지 스크립트, 공통 디렉토리, 파일 경로만 담은 sanitize된 repo summary를 바탕으로 agent matrix를 제안합니다. `.env`, task history, logs, source file contents, 이전 Claude/Codex 대화는 보내지 않습니다. CLI가 없으면 결정론적 frontend/backend/QA/deploy/docs agent 구성을 사용합니다.

**B. GitHub Template** — GitHub에서 **Use this template** → **Create a new repository**를 누른 뒤 clone합니다. 팀 작업이나 장기 운영에 적합합니다.

**C. 직접 clone**

```bash
git clone https://github.com/Zakedu/agent-kanban-harness.git
cd agent-kanban-harness
cp config.example.js config.js && cp .env.example .env
npm start
```

`npm install`은 Slack/Telegram 미러를 쓸 때만 board 폴더에서 1회 실행합니다. 보드·init·setup·gate 코어는 의존성 설치 없이 동작합니다.

브라우저에서 `http://localhost:8080`을 엽니다. UI 또는 `POST /api/tasks`로 task를 만들고 보드에서 확인합니다.

```bash
curl -X POST http://localhost:8080/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"subject":"Try it"}'
```

gate와 watch 1회 실행:

```bash
npm run gate
npm run watch:once
```

## 프로젝트에 맞게 바꾸기

전체 절차는 **[docs/adapting-to-your-project.md](docs/adapting-to-your-project.md)**에 있습니다. 요약은 다음과 같습니다.

1. **`config.js`** — `repoPath`를 앱 repo 절대경로로 지정하고, `goal`에 1주차 타겟 업무 1개를 적습니다. `deployCommands`에는 build/test 체인을 넣고, `buildOutputDir`을 설정합니다.
2. **`agents/`** — `frontend-agent.md` / `backend-agent.md`의 `owns:` glob을 실제 디렉토리에 맞춥니다. 역할이 더 필요하면 `_TEMPLATE.md`를 복사합니다.
3. **`lib/detect/`** — `sentry` / `vercel` / 커스텀 detector를 `config.js → detectors`에서 켭니다. 모니터링이 없으면 비워둡니다.
4. **`agents/deploy-gate-agent.md` + `lib/gate/`** — gate는 `config.js → deployCommands`를 실행합니다. 코드 변경보다 설정 검토가 핵심입니다.
5. **`playbooks/`** — 실제로 자주 생길 장애 유형마다 `_TEMPLATE.html`을 복사해 1페이지 runbook을 만듭니다.
6. **`hooks/`** — 앱 repo의 `.git/hooks/pre-push`에 `pre-push.sample`을 설치하고, 24h watch는 `launchd.plist.template` 또는 cron으로 등록합니다.
7. 선택: Slack bot 또는 Telegram 운영 스레드 mirror를 연결합니다.

## 운영 스레드 (Telegram mirror) — 선택

칸반 대시보드 오른쪽에는 **운영 스레드** 채팅 패널이 있습니다. Telegram을 설정하면 양방향으로 미러링되어, 휴대폰에서도 24h 운영 대화를 이어갈 수 있습니다. 칸반이 source of truth라는 점은 유지됩니다.

```
[ kanban dashboard ]                            [ your Telegram DM ]
  운영 스레드 패널 ◀──── /api/ops-thread ────▶   sendMessage / getUpdates
       │                       │                          │
       └── you type ───────────┘                          │
                               └── operator replies ──────┘
       task created / completed → 📋 / ✅ posted to both sides
```

설정:

1. Telegram에서 `@BotFather`에게 `/newbot`을 보내고 token을 받습니다.
2. 새 bot에게 본인 계정으로 아무 DM을 보냅니다.
3. `.env`에 token과 chat id를 넣습니다.

```bash
TELEGRAM_BOT_TOKEN=replace_with_botfather_token
TELEGRAM_CHAT_ID=    # 처음에는 비워둠
```

4. `npm start` 후 다른 터미널에서 확인합니다.

```bash
curl http://localhost:8080/api/telegram/whoami
# → { "ok": true, "chats": [ { "id": 6131488858, "type": "private", ... } ] }
```

5. `id`를 `TELEGRAM_CHAT_ID`에 넣고 서버를 재시작합니다.

Telegram을 쓰지 않으면 env 값을 비워두면 됩니다. 패널은 로컬 칸반 채팅으로 계속 동작합니다. 여러 사람을 허용하려면 `TELEGRAM_ALLOWED_CHAT_IDS=id1,id2`를 설정합니다.

## 리소스 관리 API

칸반 대시보드는 하네스 리소스를 직접 읽고 편집합니다. 모든 `PUT`은 빈 내용 저장을 거부하고, 파일명은 해당 리소스 디렉토리 안의 basename으로만 처리합니다.

- `GET  /api/agents` — `agents/*.md` frontmatter 목록
- `GET  /api/agents/:name/full` — agent frontmatter + 본문
- `PUT  /api/agents/:name { meta?, body, changeNote? }` — agent markdown 저장
- `GET  /api/hooks` — `hooks/` 파일 목록과 sample/template 구분
- `GET  /api/hooks/:name/full` — hook 파일 내용
- `PUT  /api/hooks/:name { content }` — hook 파일 저장
- `GET  /api/skills` — `skills/*.md` frontmatter 목록
- `GET  /api/skills/:name/full` — skill frontmatter + 본문
- `PUT  /api/skills/:name { content }` — skill markdown 저장
- `GET  /api/claude-md` — 루트 `CLAUDE.md` 내용
- `PUT  /api/claude-md { content }` — 루트 `CLAUDE.md` 저장
- `GET  /api/ops-thread?since=<id>` — thread 읽기
- `POST /api/ops-thread/append { role, text, taskId? }` — agent가 thread에 기록
- `POST /api/ops-thread/send { text }` — 운영자가 메시지 전송(Telegram 미러 포함)
- `GET  /api/telegram/status` — `{ configured, polling, chatId }`
- `GET  /api/telegram/whoami` — chat id 확인용 debug endpoint

카드 완료 시 파일을 만들려면 task `metadata.resourceAction`을 넣습니다. 지원 값은 `{ kind: "hook-create"|"skill-create"|"agent-create", name, template? }`입니다. `PUT /api/tasks/:id { status: "completed" }` 시 파일 생성에 실패하면 카드는 `in_review`로 돌아가고 `metadata.resourceActionError`에 실패 이유가 기록됩니다.

## Kanban-first 프로토콜

모든 사용자 지시는 작업 시작 전에 칸반 task가 됩니다. 지시 원문을 `description`에 남기고, agent와 `runner`를 정한 뒤 `in_progress`로 옮기고서야 작업을 시작합니다. 완료 시 `reportPath`와 `reportSummary`를 남깁니다.

예외는 **incident response**뿐입니다. production 영향이 있거나 곧 생길 상황에서 1줄짜리 명백히 되돌릴 수 있는 hotfix는 즉시 처리할 수 있지만, 1시간 안에 `metadata.source = "incident-response"` task를 사후 등록해야 합니다. 일반 버그, 기능, 문서, 리팩터는 예외가 아닙니다.

자세한 이유와 상태 머신은 **[docs/the-pattern.md](docs/the-pattern.md)**를 보세요.

## Multi-agent cross-validation

task마다 `runner`로 검증 수준을 고릅니다.

- **single-model** (`claude` / `codex`) — 테스트 실행, API polling, 상태 전이처럼 기계적인 일.
- **`reviewer:codex`** — Claude가 구현하고 Codex가 결과를 검토합니다. 구현 작업의 기본값입니다.
- **`both`** — Claude와 Codex가 같은 spec을 독립적으로 처리하고 orchestrator가 diff합니다. schema migration, access-control, money path처럼 데이터 손상·유출 위험이 큰 작업에 씁니다. 불일치 자체가 안전장치입니다.

자세한 기준은 **[docs/the-pattern.md](docs/the-pattern.md)**의 Cross-validation 섹션을 보세요.

## 예시: Generic SaaS

가상의 B2B SaaS 예시는 **[docs/example-saas.md](docs/example-saas.md)**에 있습니다. front end, API, database migrations, payments, deploy gates, monitoring을 agent ownership boundary로 나누는 방법을 보여줍니다. 실제 회사 데이터, task history, production URL, customer information은 포함하지 않습니다.

## CLI reference

`agent-kanban-harness` bin은 `npx agent-kanban-harness <cmd>`로도 실행됩니다.

| Command | 설명 |
|---|---|
| `init <project-name>` | 프로젝트 이름(영문 소문자/하이픈 권장)으로 `./<project-name>` 보드 생성. 이 값이 `boardDir` 격리 키가 됩니다. |
| `init <project-name> --guided` | 보드 생성 후 local interview로 `config.js`와 `agents/*.md` 생성 |
| `setup --guided` | 현재 checkout에서 repo scan + Claude/Codex 보조 agent setup 실행 |
| `doctor` | `claude`/`codex` availability, local config, gitignore, private runtime file 위험 확인 |
| `start [--port N]` | `server/kanban.cjs` 실행. local checkout server를 우선 사용합니다. |
| `watch [--once]` | `lib/watch/scheduler.cjs` 실행 |
| `gate` | `lib/gate/index.cjs` 실행 |
| `whoami` | 실행 중인 서버의 `/api/telegram/whoami` 호출 |
| `--version` / `--help` | 버전 / 도움말 |

## 라이선스 / 상태

MIT. 현재 상태: domain-agnostic template + npm CLI로 추출되어 있고 주요 조각은 연결되어 있습니다. production 의존 전에는 본인 repo에서 gate, runner, detector 동작을 직접 검증하세요.
