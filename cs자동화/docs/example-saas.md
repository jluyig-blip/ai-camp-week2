# 예시: Generic SaaS Setup

이 예시는 의도적으로 가상입니다. 실제 project name, user data, production task history, domain-specific operating note를 공개하지 않고 agent setup의 모양만 보여줍니다.

## 제품 형태

작은 B2B SaaS 제품을 가정합니다.

- React 또는 Next.js front end.
- Node, serverless functions, 또는 가벼운 API layer.
- migration이 있는 SQL database.
- Stripe 또는 다른 payment provider.
- Vercel, Fly.io, Render 같은 deploy target.
- 선택 Sentry 또는 log-based monitoring.

하네스는 app repo 옆에서 실행됩니다. app code는 포함하지 않습니다. 하네스가 소유하는 것은 kanban board, agent definitions, playbooks, local runner reports, gate scripts입니다.

## Config

```js
module.exports = {
  projectName: "Example SaaS",
  goal: "6주 후 — 주간 보고서 자동 생성 자동화 1개 완성",
  repoPath: "/absolute/path/to/example-saas",
  kanbanPort: 8080,
  boardDir: "example-saas",
  deployCommands: [
    { name: "01-typecheck", cmd: "npm", args: ["run", "typecheck"] },
    { name: "02-test", cmd: "npm", args: ["test"] },
    { name: "03-build", cmd: "npm", args: ["run", "build"] }
  ],
  buildOutputDir: "dist",
  detectors: []
};
```

`setup --guided`는 package scripts와 common directories를 scan한 뒤 비슷한 파일을 자동 생성합니다.

## 에이전트 매트릭스

처음에는 작고 겹치지 않는 set으로 시작합니다.

- `orchestrator`: operator request를 task로 만들고 라우팅합니다.
- `frontend-agent`: UI, routes, browser behavior, client state를 맡습니다.
- `backend-agent`: API, auth, database, migrations, shared server code를 맡습니다.
- `qa-agent`: test creation, regression check, verification evidence를 맡습니다.
- `deploy-gate-agent`: release gate와 failed deploy triage를 맡습니다.
- `docs-agent`: runbook, handoff note, onboarding doc을 맡습니다.

권장 runner 기본값:

- Frontend implementation: `reviewer:codex`
- Backend/data/auth changes: `both`
- QA and mechanical checks: `codex`
- Documentation: `claude`
- Release gate: `reviewer:codex`

## 고위험 경계

agent를 실행하기 전에 명시적 boundary를 정합니다.

- Payment and billing code는 review가 필요합니다.
- Auth and permission changes는 `both`가 필요합니다.
- Migrations는 `both`와 rollback note가 필요합니다.
- Production deploy는 gate pass가 필요합니다.
- Human-impacting automated decision은 detection-and-escalation만 허용합니다.

## Playbooks

제품에 실제로 있는 incident마다 1페이지 playbook을 만듭니다.

- Build failure.
- E2E regression.
- Error-rate spike.
- Payment webhook failure.
- Database migration rollback.
- Customer-impacting login failure.

공개 template에서는 playbook도 가상으로 유지하세요. real provider ID, customer name, Slack channel, on-call name, production URL은 local private config에 둡니다.

## 공개 저장소 개인정보 규칙

public repository에는 pattern만 넣고 company는 넣지 않습니다.

- `config.example.js`는 포함하고 `config.js`는 포함하지 않습니다.
- `.env.example`은 포함하고 `.env`는 포함하지 않습니다.
- fake playbook은 포함하고 real incident log는 포함하지 않습니다.
- agent template은 포함하고 production task history는 포함하지 않습니다.
- sanitized example은 포함하고 app-specific customer, payment, auth, analytics data는 포함하지 않습니다.
