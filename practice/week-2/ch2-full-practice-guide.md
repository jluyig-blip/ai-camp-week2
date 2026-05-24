# Ch2 실습 가이드 — 컨텍스트 세팅 + 첫 격차 분석

> 2주차의 목표는 코드를 많이 쓰는 것이 아니라, AI가 내 업무를 제대로 이해하도록 **좋은 입력, 좋은 출력, 작업 경계**를 파일로 고정하는 것입니다.
> 오늘 만든 격차 분석은 3주차 제약 조건의 재료가 됩니다.

## 오늘 만들 파일

| 파일 | 목적 | 필수 |
|---|---|---|
| `plan.md` | 이번 주에 만들 산출물 1개와 AI/사람 역할 경계 정리 | 필수 |
| `golden/input-example.md` | 실제 입력 예시 1건 이상 | 필수 |
| `golden/output-example.md` | 이상적인 출력 예시 1건 이상 | 필수 |
| `outputs/draft-1.md` | AI가 만든 첫 초안 | 필수 |
| `outputs/gap-analysis.md` | 초안과 골든 출력의 차이 분석 | 필수 |
| `outputs/workflow-map.md` | 입력→처리→출력→사람 검토 순서도 | 선택 |
| GitHub 계정명 + 레포 URL | 본인 작업폴더를 보관할 개인 레포지토리 | 필수 |

## Step 1. 작업공간 만들기

```bash
npx -y @scaila/camp-cli@latest doctor
npx -y @scaila/camp-cli@latest login
npx -y @scaila/camp-cli@latest init --folder ./ai-camp-week2 --yes
cd ai-camp-week2
```

막히면 설치 문제를 오래 붙잡지 말고 LMS 웹 제출 경로로 우회합니다.

## Step 2. 이번 주 산출물 한 줄 정하기

`plan.md`에 아래처럼 적습니다.

```markdown
# 2주차 계획

- 내가 만들 산출물:
- 실제 입력:
- 이상적인 출력:
- AI가 맡을 일:
- 사람이 최종 확인할 일:
- 오늘 자동화에서 제외할 일:
```

## Step 3. 골든 데이터 넣기

`golden/input-example.md`에는 실제로 들어올 입력을 넣습니다. 이메일, 표, 상담 메모, 원본 엑셀을 복사한 표, 기사 목록 등 형태는 상관없습니다.

`golden/output-example.md`에는 그 입력을 사람이 잘 처리했을 때의 이상적인 결과를 넣습니다. 이 파일이 없으면 AI는 목표 품질을 알 수 없습니다.

개인정보와 고객 식별 정보는 반드시 익명화합니다.

## Step 4. 에이전트 규칙 만들기

`CLAUDE.md` 또는 `AGENTS.md`에 목표, 참조 파일, 작업 규칙, 금지 범위를 적습니다. 막히면 `ch2-claude-md-example.md`를 열어 본인 업무에 맞게 바꿉니다.

```text
내 plan.md와 golden/ 폴더를 읽고,
이 업무를 처리하는 에이전트 규칙을 CLAUDE.md 형태로 정리해줘.
실제 발송, 결제, 로그인, 외부 시스템 입력은 금지 범위로 분리해줘.
```

## Step 5. 첫 초안 만들기

```text
plan.md와 golden/input-example.md, golden/output-example.md를 읽고
새 입력을 처리한 첫 초안을 만들어줘.
결과는 outputs/draft-1.md로 저장해줘.
```

새 입력이 아직 없으면 `golden/input-example.md`를 그대로 사용해도 됩니다. 오늘의 목적은 완성품이 아니라 첫 격차를 보는 것입니다.

## Step 6. 격차 분석하기

`outputs/draft-1.md`와 `golden/output-example.md`를 비교해 `outputs/gap-analysis.md`를 채웁니다. 템플릿은 `ch2-gap-analysis-worksheet.md`입니다.

```text
outputs/draft-1.md와 golden/output-example.md를 비교해서
빠진 정보, 구조 차이, 톤 차이, 사실 오류, AI/사람 경계 위반을 찾아줘.
결과는 outputs/gap-analysis.md로 저장해줘.
마지막에는 3주차 제약 조건 후보 3개를 적어줘.
```

## 선택 실습. 업무 순서도 만들기

순서도는 어렵게 그리지 않습니다. Mermaid 코드블록 하나면 됩니다. 템플릿은 `ch2-workflow-map-template.md`입니다.

```text
내 1주차 나침반과 plan.md, golden/ 폴더를 읽고
내 자동화 업무를 입력 → 처리 → 출력 → 사람 검토 흐름으로 나눠줘.
outputs/workflow-map.md 파일에 단계 표와 Mermaid flowchart를 저장해줘.
AI가 하면 안 되는 단계는 사람 실행 단계로 분리해줘.
```

## Step 7. GitHub 레포지토리 만들기

2주차부터는 본인 작업물을 개인 GitHub 레포지토리에 남깁니다. 계정이 없다면 https://github.com 에서 먼저 가입합니다.

GitHub에서 `ai-camp-week2` 레포지토리를 만든 뒤 Claude Code에게 아래처럼 시킵니다.

```text
현재 폴더는 The Camp 2주차 과제 폴더야.
plan.md, golden/, outputs/, CLAUDE.md를 읽고 GitHub에 올릴 README.md와 .gitignore를 만들어줘.
README에는 자동화 MVP 한 줄, AI/사람 역할 경계, 입력 예시, 골든 출력, 첫 초안 격차, 3주차 제약 조건 후보를 넣어줘.
.gitignore에는 node_modules, .env, .DS_Store, 토큰 파일, 실제 고객 정보 파일을 제외해줘.
```

레포를 만든 사람은 아래 명령을 사용합니다. `<본인계정명>`은 실제 GitHub username으로 바꿉니다.

```bash
git init
git add README.md plan.md golden outputs CLAUDE.md .gitignore
git commit -m "week2 context setup"
git branch -M main
git remote add origin https://github.com/<본인계정명>/ai-camp-week2.git
git push -u origin main
```

자세한 안내는 `ch2-github-repo-guide.md`를 참고합니다.

## 제출

CLI가 되는 사람:

```bash
npx -y @scaila/camp-cli@latest assignment list --week 2
npx -y @scaila/camp-cli@latest assignment submit ch2-context-gap --file outputs/gap-analysis.md --yes
npx -y @scaila/camp-cli@latest status
```

CLI가 막히는 사람은 camp.scaila.kr의 **과제** 탭에서 같은 내용을 붙여넣어 제출합니다. 과제 탭에는 **GitHub 계정명**과 **개인 레포지토리 URL**도 함께 입력합니다.

## 다음 주 연결

3주차에는 `outputs/gap-analysis.md`에서 나온 문제를 제약 조건으로 바꿉니다. 예를 들면 “출력 순서 고정”, “추측 금지”, “사람 검토 필요 케이스 표시”, “길이 제한”, “필수 표 형식 유지” 같은 규칙입니다.
