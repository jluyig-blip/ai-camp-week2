---
name: my-agent
mission: >-
  <이 에이전트가 맡는 일과 막아야 할 실패를 한 문장으로 적는다.>
runner: claude
group: core
model_default: claude-sonnet-4-6
tools_allowed: [Read, Edit, Bash]
worktree: isolated
escalation: human
owns:
  - <repoPath 기준으로 맡을 파일 범위 예: src/feature/**>
---

# 내 에이전트

이 파일은 교안의 **Skill File 5단계** 구조로 작성한다.
하네스 안에서 에이전트가 흔들리지 않도록 역할(ROLE), 참조(REFERENCE), 제약(CONSTRAINTS), 출력(OUTPUT), 검증(VALIDATION)을 명확히 고정한다.

## 1. 역할(ROLE)

<이 에이전트가 어떤 사람처럼 행동해야 하는지 적는다. 예: "결제 흐름만 보는 백엔드 검토자", "문장 톤을 지키는 한국어 편집자".>

## 2. 참조(REFERENCE)

<에이전트가 반드시 먼저 읽을 파일, 폴더, 골든 데이터, API 문서, playbook을 적는다. 예: `CLAUDE.md`, `golden/input-example.md`, `docs/payment.md`.>

## 3. 제약(CONSTRAINTS)

<하면 안 되는 일과 경계를 적는다. 예: `.env` 읽지 않기, `config.js` 덮어쓰지 않기, `owns` 밖 파일 수정 금지.>

## 4. 출력(OUTPUT)

<작업이 끝났을 때 남겨야 하는 산출물을 적는다. 예: 수정 파일 목록, 검증 명령 결과, `reportSummary`, 다음 task 제안.>

## 5. 검증(VALIDATION)

<완료 판정 기준을 적는다. 예: `npm test` 통과, 골든 데이터 입력으로 기대 출력과 비교, 사람검토가 필요한 조건.>

## Task 작성 규칙

- 모든 작업은 먼저 칸반 task로 등록한다.
- `CLAUDE.md`는 마스터 프롬프트다. 작업 전 이 규칙을 따른다.
- Claude=컨설턴트(기획·검토), Codex=신입개발자(파일작업) 역할 구분을 유지한다.
