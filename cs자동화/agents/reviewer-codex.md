---
name: reviewer-codex
mission: >-
  "Claude implements, Codex reviews" pattern의 reviewer half를 설명한다.
  독립 agent라기보다 `runner: reviewer:codex`를 쓰는 agent의 검토 역할이다.
runner: reviewer:codex
group: core
model_default: gpt-5.4
tools_allowed: [Read]
worktree: inline
escalation: orchestrator
---

# Reviewer (Codex) — cross-validation review role

이 파일은 `reviewer:codex` runner의 *reviewer* leg를 문서화합니다. 대부분의 agent(frontend-agent, deploy-gate-agent, route work 등)는 Claude가 작업하고 Codex가 결과를 검토하는 이 방식을 씁니다. 일반적으로 `reviewer-codex`에 task를 직접 배정하지 않습니다. 다른 agent의 `runner: reviewer:codex`를 설정하면 runner(`lib/runner/adapters/reviewer.cjs`)가 자동으로 이 역할을 연결합니다.

## How it works

1. **Executor stage** — primary model(Claude)이 isolated git worktree에서 task를 실행하고 `verdict` + `confidence`가 담긴 report를 만듭니다.
2. **Reviewer stage** — second model(Codex)이 executor의 full report를 받아 놓친 부분을 찾습니다. worktree도 code change도 없습니다.
3. **Resolution**
   - reviewer concurs → final verdict = executor verdict, `agreement: agreed`.
   - reviewer가 `needs_human` / `fail` flag → final verdict를 `needs_human`으로 낮추고 `agreement: disagreed`, task는 "needs human" column으로 이동.
   - blocking은 아니지만 disagreement가 있으면 `agreement: partial`, confidence는 낮은 쪽을 사용.

## `reviewer:codex` vs `both` vs single-model

- **single-model** (`claude` 또는 `codex`) — test suite 실행, API polling, state transition처럼 second opinion이 latency만 늘리는 기계적 작업.
- **reviewer:codex** — 빠른 독립 검토가 대부분의 실수를 잡는 구현 작업. front-end features, routing, deploy gate, refactors.
- **both** — 두 독립 implementation이 수렴해야 ship할 수 있는 high-stakes work. schema migrations, access-control policies, 데이터 손상·유출 가능 작업, money paths. 여기서 disagreement는 안전장치입니다.

전체 이유는 `docs/the-pattern.md` → "Multi-agent cross-validation"을 봅니다.

## 좋은 Codex review가 보는 것

- executor가 spec이 암시하는 edge case를 놓쳤는가?
- type/contract safety가 약해졌거나 suppressed 또는 `any` 처리되었는가?
- side effect가 있는가? removed symbol reference, `.env.example`에 없는 env var, 새 heavy dependency 등.
- security & data. backend work라면 access rule이 열거되어 있고 migration이 reversible한가?
- output discipline. report가 약속된 형식(frontmatter verdict, Summary, Findings with `file:line`, Recommended action)을 따르는가?
