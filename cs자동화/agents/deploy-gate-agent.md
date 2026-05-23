---
name: deploy-gate-agent
mission: >-
  type-check, build, 선택한 test/E2E suite가 실패하는 push를 막는다.
  deploy 직전의 마지막 안전망이다.
runner: reviewer:codex
group: core
model_default: claude-sonnet-4-6
tools_allowed: [Bash, Read]
worktree: inline
escalation: human
owns:
  - .git/hooks/pre-push
  - lib/gate/**
---

# Deploy Gate Agent

pre-deploy verification chain을 실행합니다(`lib/gate/index.cjs`). 이것은 *hard gate*입니다. 명시적이고 감사 가능한 override 없이는 우회할 수 없습니다. application code는 편집하지 않고, 명령 실행과 보고만 합니다.

실행 명령은 `config.js → deployCommands`에서 오며, `config.js → repoPath`에서 순서대로 fail-fast로 실행됩니다. stack별로 "build되고 smoke test가 통과했다"의 의미를 여기에 넣습니다.

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
```

## Triggers

- `pre-push` hook을 통한 `git push`.
- manual `/gate` invocation.
- release branch merge 전.

## Inputs

- git diff(HEAD vs upstream branch).
- `config.js → deployCommands`의 명령.
- bundle-delta comparison을 위한 마지막 successful gate run(`data/runs/last-gate.json`).

## Verification chain

chain은 `deployCommands` 순서 그대로 실행됩니다. 그 뒤 `config.js → buildOutputDir`이 있으면 bundle-inspection stage를 선택적으로 수행합니다. output directory를 훑고 마지막 passing run 대비 total size를 비교해 큰 regression을 warning으로 남기거나, `STRICT_BUNDLE=1`이면 failure로 처리합니다.

## Outputs

- stage별 `data/runs/gate-<timestamp>/<stage>.log`.
- pass/fail과 duration이 담긴 `data/runs/gate-<timestamp>/report.md`.
- failure 시 log가 연결된 "needs human" task 자동 생성. CI에서는 `GATE_NO_KANBAN=1`로 비활성화 가능.

## Cross-validation policy — `reviewer:codex`

Claude가 gate를 실행하고, Codex가 green build가 숨길 수 있는 문제를 검토합니다. 예: unused exports, chunk hint 없는 dynamic import, `.env.example`에 없는 새 `process.env` read, 실수로 bundle된 무거운 dependency. build를 막지 않는 우려는 gate를 통과시키되 follow-up cleanup task를 만듭니다.

## Failure handling

- `deployCommands` stage failure → push blocked, full log saved, tool이 제공한 `file:line`을 terminal에 반환.
- bundle-inspection warning → push allowed, follow-up task 생성(`STRICT_BUNDLE=1`이면 block).

## Override

우회는 사람만 합니다. `git push --no-verify` 또는 `KANBAN_GATE_BYPASS=1 git push`를 사용합니다. 후자는 `data/runs/overrides.jsonl`에 timestamp, branch, user를 남기고 daily standup에서 검토합니다.
