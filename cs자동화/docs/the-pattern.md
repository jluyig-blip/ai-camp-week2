# 하네스 패턴

이 하네스가 이런 모양을 갖는 이유입니다. 핵심은 다섯 가지이고, 각각은 나중에 큰 사고를 막기 위한 제약입니다.

## 1. Kanban-first: 모든 지시는 작업 전에 task가 된다

사람이 "로그인 버그 고쳐줘", "쿠폰 필드 추가해줘", "build가 실패해"라고 말하면 orchestrator의 첫 행동은 칸반 task 작성입니다. 지시 원문을 `description`에 남기고, 짧은 `subject`를 만들고, agent와 `runner`를 정한 뒤 `in_progress`로 옮깁니다. 그 다음에야 작업을 시작합니다.

이유:

- **보이지 않는 작업을 없앱니다.** 두 agent 또는 사람과 agent가 조용히 같은 일을 붙잡고 있지 않습니다. 카드 하나, 담당 하나, 상태 하나입니다.
- **라우팅이 명시됩니다.** agent와 `runner`(`claude` / `codex` / `both` / `reviewer:*`)가 추측이 아니라 카드에 기록됩니다.
- **흔적이 남습니다.** `createdAt` / `startedAt` / `completedAt`, report path, cross-validation verdict가 카드에 남습니다.
- **standup이 자동으로 만들어집니다.** activity log가 곧 업무 기록입니다.

예외는 **incident response**뿐입니다. production 영향이 있거나 곧 생길 상황이고, 수정이 작고 명백히 되돌릴 수 있다면 먼저 처리할 수 있습니다. 단 1시간 안에 `metadata.source = "incident-response"`가 붙은 사후 task를 등록하고, 무엇을 했는지와 후속 작업을 남겨야 합니다. refactor, docs, feature, ordinary bug는 예외가 아닙니다.

구현 기준은 `agents/orchestrator.md`, 보드는 `server/kanban.cjs`입니다.

## 2. Cross-validation: 검증 수준을 의도적으로 고른다

모든 task에는 `runner`가 있습니다. 비용과 엄격함 순서로 세 가지입니다.

- **single-model** (`claude` 또는 `codex`) — 테스트 실행, API polling, 상태 전이처럼 기계적이고 결정적인 작업. 두 번째 의견이 지연만 늘리는 경우입니다.
- **`reviewer:codex`** 또는 **`reviewer:claude`** — 실행 모델이 분리된 git worktree에서 작업하고 verdict를 남깁니다. 다른 모델이 그 report를 받아 놓친 부분을 찾습니다. 구현 작업의 기본값입니다. blocking flag가 있으면 verdict는 `needs_human`으로 내려갑니다.
- **`both`** — Claude와 Codex가 같은 spec을 독립적으로 처리하고 orchestrator가 diff합니다. agreement면 auto-merge, disagreement면 "needs human" 컬럼으로 이동합니다. schema migration, access-control/RLS-style policy, 데이터 손상·유출 가능 작업, money path에 씁니다. **불일치가 안전장치**입니다. 두 독립 해석이 수렴하지 못한 것을 시스템이 출고하지 않는다는 뜻입니다.

orchestrator는 severity가 임계값(`CROSS_VALIDATION_THRESHOLD`) 이상이면 single-model task를 `both`로 승격할 수 있습니다. second model 일일 예산(`DAILY_CODEX_BUDGET`)도 있습니다. 예산이 소진되면 `codex` / `both` / `reviewer:codex`는 Claude 단독으로 fallback하고, Claude는 부하에 따라 `MODEL_FALLBACK_CHAIN`을 탑니다. 구현은 `lib/runner/`에 있습니다.

## 3. Selvedge boundaries: agent는 겹치지 않는 영역을 맡는다

각 agent는 `owns:` glob을 선언합니다. orchestrator는 "이 파일을 누가 맡는가?"를 이 glob으로 판단하고, agent는 자기 영역 안에서만 움직입니다. `frontend-agent`는 server를 건드리지 않고, `backend-agent`는 component를 건드리지 않습니다. `deploy-gate-agent`는 애플리케이션 코드를 편집하지 않고 명령만 실행합니다.

shared type, dependency manifest, migration처럼 공유 표면은 cross-check가 필요한 자리입니다. 바로 이런 곳에서 `runner: both`가 의미를 가집니다. 경계가 깨끗해야 라우팅이 자동화되고, 문제가 생겼을 때 책임 영역도 추적할 수 있습니다.

## 4. Human-approval gates: 어떤 일은 자동 병합하지 않는다

hard gate는 agent가 우회할 수 없는 문입니다. 사람만 명시적으로 넘을 수 있습니다. 이 하네스의 기본 hard gate는 두 가지입니다.

- **Pre-deploy gate** (`lib/gate/index.cjs`, `hooks/pre-push.sample`) — `git push` 시 build/test 명령을 fail-fast로 실행합니다. 실패하면 push를 막고, log가 연결된 "needs human" task를 자동 생성합니다. 우회는 `git push --no-verify` 또는 `KANBAN_GATE_BYPASS=1 git push`뿐이며, 후자는 `data/runs/overrides.jsonl`에 남아 standup에서 검토됩니다.
- **Cross-validation disagreement** (`runner: both`) — 두 모델 결과가 다르면 diff와 함께 task가 "needs human"으로 갑니다. auto-merge하지 않습니다. 사람이 선택합니다.

원칙은 단순합니다. deploy, destructive migration, money movement, moderation action처럼 되돌리기 어렵거나 외부에 보이는 일은 마지막 서명을 사람이 합니다. agent는 일을 하고, 사람은 출고 책임을 집니다.

## 5. Incident playbooks: 산문이 아니라 훑어보는 runbook

playbook(`playbooks/*.html`)은 한 incident type을 위한 1페이지 runbook입니다. 무엇이 trigger인지, 어떻게 diagnose하는지, decision tree는 무엇인지, 언제 escalate하는지, 사후에 무엇을 할지 적습니다.

압박이 있는 순간 읽히기 때문에 짧고 훑기 쉬워야 합니다. task는 관련 playbook을 링크하고, monitor agent는 anomaly를 playbook이 붙은 task로 라우팅합니다. `playbooks/_TEMPLATE.html`에서 시작해 실제로 신경 쓰는 incident마다 하나씩 만드세요. 한 화면을 넘어가면 playbook이 아니라 documentation입니다.
