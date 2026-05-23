# Student Distribution — AI 하네스 6주 완주반 3주차+ 도구

> 이 문서는 학생에게 `agent-kanban-harness`를 배포하고 업데이트하는 기준을 정리한다.
> 이 패키지는 독립 도구이며 다른 CLI 패키지와 연동하지 않는다.

## 교안 기준 용어

- **하네스** = AI를 묶어두는 고삐 = 설계+파일+절차의 묶음
- **골든 데이터** = 이상적 입력 한 묶음(input-example) + 이상적 출력 1~2건(output-example)
- **Skill File 5단계** = 역할(ROLE)·참조(REFERENCE)·제약(CONSTRAINTS)·출력(OUTPUT)·검증(VALIDATION)
- **3 기둥** = 컨텍스트 / 지시 체계 / 평가 루프
- **CLAUDE.md** = 마스터 프롬프트
- **Claude=컨설턴트(기획·검토), Codex=신입개발자(파일작업)**

## 배포 목표

학생은 3주차부터 본인 프로젝트 옆에 이 하네스를 설치한다. 하네스는 학생 repo의 코드를 직접 포함하지 않고, `config.js -> repoPath`가 가리키는 프로젝트를 칸반 task, agent, 골든 데이터, 평가 루프로 운전한다.

핵심 목표는 세 가지다.

1. **컨텍스트 고정** — `CLAUDE.md`, `config.js`, `agents/*.md`, `golden/`로 프로젝트 배경과 작업 경계를 고정한다.
2. **지시 체계 고정** — 모든 작업을 먼저 칸반 task로 등록하고, orchestrator가 specialist agent로 라우팅한다.
3. **평가 루프 고정** — single-model / review / cross-validation 중 하나를 선택해 작업 검증 수준을 명시한다.

## 권장 설치 흐름

### npx 방식 (기본)

```bash
cd ~/Projects
npx agent-kanban-harness init my-todo-app
```

`init` 한 번이면 끝난다. 이 명령은 순서대로 다음을 한다.

1. `my-todo-app/` 디렉토리에 하네스 파일을 scaffold 한다. 이 이름은 프로젝트 이름이자 `boardDir` 격리 키다.
2. **첫 칸반 task(`#1`) "Claude Code와 대화하며 이 보드 셋업하기"를 자동 등록**한다.
3. **로컬 칸반 서버를 자동으로 실행**하고, 기본 브라우저로 `http://localhost:8080` 보드를 연다.

학생은 `npm install`이나 `npm start`를 따로 칠 필요가 없다. 서버를 끄려면 터미널에서 `Ctrl+C`, 다시 켜려면 `npx agent-kanban-harness start`.

서버 없이 scaffold만 하려면 `--no-start`를 붙인다(CI·점검용).

```bash
npx agent-kanban-harness init my-todo-app --no-start
```

### GitHub Template 방식

1. `github.com/Zakedu/agent-kanban-harness`에서 **Use this template**를 누른다.
2. 본인 GitHub 계정에 새 repo를 만든다.
3. 로컬에 clone 한다.
4. Claude Code에 README 최상단의 설치 프롬프트를 붙여넣는다.

GitHub 계정에 본인 repo가 생기므로, 이후 `commit`·`update`로 git 흐름을 직접 익힐 수 있다.

## 설치 직후 — 두 눈으로 확인

서버가 뜨면 학생은 보드에서 본인이 설치한 하네스를 직접 본다.

- **보드 task `#1`** — "Claude Code와 대화하며 이 보드 셋업하기" 카드가 `pending`에 있다. 이 카드를 `in_progress`로 옮기고 Claude Code와 `setup --guided`를 진행한다.
- **하네스 개요 패널** — 보드 화면의 개요 패널에서 프로젝트명, `repoPath`, `goal`, 에이전트 목록, 골든 데이터 경로, 평가 루프 레벨, 칸반 포트를 한눈에 본다. **재설정 버튼**으로 `setup`을 다시 돌릴 수 있다.
- **버전 배너** — 강사가 새 버전을 배포하면 보드 상단에 업데이트 배너가 뜬다.

`setup --guided`가 묻는 5가지:

1. 이 하네스가 운전할 프로젝트 절대경로(repoPath)
2. 골든 데이터 위치(`golden/` 폴더, 없으면 비워두고 나중에 등록)
3. 에이전트 구성(필요한 specialist agent 선택, 부족하면 `_TEMPLATE.md`로 직접 작성)
4. 평가 루프 레벨(single-model / review / cross-validation)
5. 이 프로젝트의 목표(`goal`) — 1주차에 고른 타겟 업무 1개, 6주 후 무엇을 달성할지

`setup`이 끝나면 `config.js`가 채워지고 `agents/*.md`가 본인 프로젝트에 맞게 세팅된다. 그 결과는 다시 하네스 개요 패널에서 확인한다.

## 학생 repo에 남는 것

| 파일/폴더 | 역할 |
|---|---|
| `CLAUDE.md` | 마스터 프롬프트. Kanban-First와 하네스 운영 규칙의 기준 |
| `config.js` | 로컬 설정. repoPath, goal, goldenDir, evaluationLevel, agent matrix 저장. gitignore 대상 |
| `agents/*.md` | Skill File 5단계로 작성한 specialist agent 정의 |
| `golden/` | 골든 데이터. `input-example.md`, `output-example.md`를 두는 기본 위치 |
| `ui/` | 칸반 보드와 하네스 개요 패널 |
| `playbooks/` | 반복 장애나 운영 상황을 task로 바꾸는 절차 문서 |
| `skills/` | Claude Code에서 재사용할 짧은 작업 스킬 |

## 커스터마이즈 영역

학생이 직접 바꿔도 되는 영역과 다시 설정하는 방법은 아래와 같다.

| 항목 | 어디서 바꾸나 | `setup --guided`로 재설정 가능? |
|---|---|---|
| `repoPath` | `config.js` 또는 `setup --guided` 질문 1 | 가능 |
| `goal` | `config.js`의 `goal` 필드 또는 `setup --guided` 질문 5 | 가능 |
| 골든 데이터 | `config.js → goldenDir`, 기본 `golden/` 폴더의 `input-example.md`, `output-example.md` | 경로는 가능, 파일 내용은 직접 관리 |
| `agents/*.md` | `agents/` 폴더. `_TEMPLATE.md`를 복사해 Skill File 5단계 작성 | 가능. 단 기존 파일 덮어쓰기에는 `--force` 필요 |
| 평가 루프 | `config.js → evaluationLevel`, 각 agent/task의 `runner` | 가능 |
| hooks | `hooks/pre-push.sample`, `hooks/launchd.plist.template` | 불가. 직접 설치/수정 |
| skills | `skills/*.md` | 불가. 직접 추가/수정 |
| `deployCommands` | `config.js → deployCommands` | scan 결과 기반으로 가능. 세부 명령은 직접 검토 |
| `CLAUDE.md` | 루트 `CLAUDE.md`, 보드 UI의 리소스 편집 | 불가. 직접 수정 |

## 업데이트 정책

학생 로컬 작업을 보호하기 위해 업데이트는 명시적으로만 실행한다.

```bash
npx agent-kanban-harness update --diff
npx agent-kanban-harness update
```

- 동기화 대상: `agents/`, `playbooks/`, `skills/`, `ui/`
- 절대 덮어쓰지 않는 것: `config.js`, `.env`, 칸반 task, `*.local.md`
- `update --diff`는 파일을 바꾸지 않고 강사 버전 변경점만 보여준다.
- 학생이 수정한 agent가 있다면 먼저 `--diff`로 확인한 뒤 필요한 부분만 수동 머지한다.

## 운영 규칙

모든 작업은 먼저 칸반 task가 된다. Claude Code와 대화로 진행하는 일도 예외가 아니다. 카드 없이 시작하지 않는다.

작업 진행 기본 순서:

1. task 등록
2. orchestrator가 agent와 평가 루프 지정
3. specialist agent가 작업
4. 골든 데이터 또는 실행 명령으로 검증
5. 결과를 `reportSummary`에 남기고 완료 처리

이 규칙이 학생에게 "AI가 알아서 했다"가 아니라 "하네스가 AI를 묶어두고 절차대로 운영했다"는 감각을 만든다.
