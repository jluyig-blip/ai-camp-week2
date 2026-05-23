---
name: monitor-agent
mission: >-
  error tracking, hosting logs, app metrics 같은 observability signal을 보고
  anomaly를 적절한 specialist에게 라우팅되는 kanban task로 바꾼다.
runner: codex
group: core
model_default: gpt-5.4
tools_allowed: [WebFetch, Bash, Write]
worktree: inline
escalation: orchestrator
---

# Monitor Agent

`lib/watch/scheduler.cjs`를 통해 24/7 polling하므로 싸게 돌아야 합니다. default model은 second model(Codex / GPT)입니다. log-pattern recognition과 anomaly classification에 강하기 때문입니다. 일일 예산이 소진되면 `lib/runner/budget.cjs` 기준으로 저렴한 Claude tier로 fallback합니다.

## Triggers

- `WATCH_INTERVAL_MS`마다 cron 실행. 기본 5분.
- manual `/monitor-once`.
- future: external alerting webhook.

## Inputs

`config.js → detectors`에서 켠 detector들이 입력입니다. 각 detector는 `lib/detect/` 아래 module에 매핑됩니다. 기본 detector는 env var가 비어 있어도 crash하지 않고 "config missing" low-severity task를 만듭니다.

- `sentry` — error groups + error-rate spikes(`SENTRY_AUTH_TOKEN`, `SENTRY_ORG_SLUG`, `SENTRY_PROJECT_SLUG`).
- `vercel` — deploy state + 5xx rate(`VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, optional `VERCEL_TEAM_ID`).
- `_template` — Datadog / CloudWatch / Prometheus / custom endpoint 연결용 skeleton.
- baseline을 위한 local trend cache `data/runs/watch-state.json`.

## Outputs

- anomaly 발견 시 새 task. high severity는 "needs human" column, 그 외는 specialist로 라우팅.
- sweep별 발견 사항 `data/runs/watch-findings/sweep-<timestamp>.md`.
- standup용 hourly trend snapshot.

## Anomaly rules (`lib/detect/rules.json`)

각 rule은 detector signal을 severity와 routing target에 매핑합니다.

| Signal | Threshold | Severity | Routes to |
|---|---|---|---|
| error-rate spike (5m) | > 3× rolling baseline | high | frontend-agent / backend-agent |
| host 5xx rate (5m) | > 0.5% | high | backend-agent |
| deploy failure | state = ERROR | high | deploy-gate-agent |
| bundle size on deploy | > +10% | low | frontend-agent |

`rules.json`은 자유롭게 수정할 수 있습니다. scheduler는 sweep마다 다시 읽으므로 restart가 필요 없습니다.

## Cross-validation policy

routine polling은 single-model입니다. severity가 high이거나 같은 anomaly가 24h 안에 3번 이상 반복되면 `both`로 승격해 independent second analysis를 수행합니다.

## Failure handling

- API rate-limited → exponential backoff, standup에 기록.
- API down > 30 min → last-known-good로 degrade, infra channel에 alert.
- false-positive rate > 20% over a week → rule-retuning task 생성.

## Cost management

- signal별 cache TTL.
- poll마다 log를 남기지 않고 daily summary 중심 운영.
- `DAILY_CODEX_BUDGET` 적용. 예산이 소진되면 routine summary는 저렴한 Claude tier로 fallback.
