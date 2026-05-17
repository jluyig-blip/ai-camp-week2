# Ch2 실습 — 컨텍스트 세팅: 워크스페이스 + 골든 데이터 + 첫 초안

> 2주차의 목표: **하네스의 1번째 기둥 = 컨텍스트.** 1주차에 정한 본인 타겟 업무로
> 골든 데이터를 가져와 에이전트에게 주고, 첫 초안을 받고, 격차를 분석한다.

## 0. 준비물
- **Node.js 18+** — 없으면 [nodejs.org](https://nodejs.org/ko) 에서 LTS, 또는 mac 은 `brew install node`. 설치 후 터미널을 완전히 닫았다 다시 연다.
- camp.scaila.kr 대시보드 **[터미널] 탭의 6자리 코드**
- (권장) Claude Code 또는 Codex 유료 구독
- GitHub 계정 — 없으면 https://github.com 에서 가입
- **본인 과제의 골든 데이터 1세트** — 1주차에 정한 타겟 업무의 "이상적인 입력 + 이상적인 출력". → `ch2-golden-data-template.md` 참고. (아직 못 가져온 분은 강의 중에 데모 시나리오로 진행)

## Step 1 — 워크스페이스 만들기 (다 같이, 공통 명령)
터미널 열고:
```
npx -y @scaila/camp-cli@latest
```
5스텝 마법사: ① 환경점검 ② 로그인(6자리 코드) ③ 작업폴더 생성 (`ai-camp-week2/`) ④ 커뮤니티 첫 글 ⑤ Claude Code/Codex 진입.
- 막히면: `npx -y @scaila/camp-cli@latest doctor`
- 설치가 어려울 것 같으면 **강의 30분 전(목 18:30)** 에 오면 미리 도와드립니다.

## Step 2 — 골든 데이터 넣기
`ai-camp-week2/golden/` 폴더에:
- `golden/input-example.md` — 실제로 들어올 입력 데이터 1건 이상 (가공하지 말 것)
- `golden/output-example.md` — 그 입력에 대한 *이상적인* 출력 1~2건 (직접 잘 쓴 결과물)

양·형태는 `ch2-golden-data-template.md` 참고. 막히면 Claude Code 에게:
> "내 과제는 [한 줄 설명]이야. 골든 데이터로 뭘 어떻게 준비하면 좋을지 같이 정리해줘 — 입력 예시와 출력 예시를 각각 어떤 형태로 만들어야 하는지."

## Step 3 — 에이전트 1개 세팅
`ai-camp-week2/CLAUDE.md` (Codex 면 `AGENTS.md`) 에 이 에이전트의 **목표 · 컨텍스트(골든 데이터 경로) · 작업 규칙 · AI↔사람 경계** 를 적는다. → `ch2-claude-md-example.md` 참고.

## Step 4 — 첫 초안 받기
Claude Code 에게:
> "golden/ 의 input-example 과 output-example 을 보고, 새 입력(`golden/input-2.md` 또는 내가 지금 줄게)에 대한 첫 초안을 만들어줘. `outputs/draft-1.md` 로 저장."

→ `outputs/draft-1.md` 생성.

## Step 5 — 초안 ↔ 골든 격차 분석
`outputs/draft-1.md` 와 `golden/output-example.md` 를 나란히 놓고 차이를 항목별로 적는다. → `ch2-gap-analysis-worksheet.md` 채우기. **이 격차가 3주차 "제약 조건"의 입력이 된다.**

## Step 6 — 선택: 업무 순서도 만들기
초보자에게 새 도식 도구를 설치시키면 어렵습니다. 대신 `outputs/workflow-map.md` 안에 Mermaid 코드블록으로 순서도를 만듭니다. → `ch2-workflow-map-template.md` 참고.

Claude Code 또는 Codex에게:
> "plan.md와 golden/ 폴더를 읽고 내 업무를 입력 → 처리 → 출력 → 사람 검토 흐름으로 나눠줘. `outputs/workflow-map.md`에 단계 표와 Mermaid flowchart를 저장해줘. AI가 하면 안 되는 단계는 사람 실행 단계로 분리해줘."

## Step 7 — GitHub 레포지토리 만들기
GitHub에서 `ai-camp-week2` 이름의 개인 레포지토리를 만듭니다. 초보자는 민감정보를 익명화한 뒤 Public으로 만드는 것이 가장 단순합니다. 회사 자료가 섞이면 Private으로 만들고 강사에게 접근 권한을 줍니다.

Claude Code에게:
> "현재 폴더의 plan.md, golden/, outputs/, CLAUDE.md를 읽고 GitHub 제출용 README.md와 .gitignore를 만들어줘. README에는 자동화 MVP 한 줄, AI/사람 역할 경계, 입력 예시, 골든 출력, 첫 초안 격차, 3주차 제약 조건 후보를 넣어줘. .gitignore에는 node_modules, .env, .DS_Store, 토큰 파일, 실제 고객 정보 파일을 제외해줘."

터미널에서:
```
git init
git add README.md plan.md golden outputs CLAUDE.md .gitignore
git commit -m "week2 context setup"
git branch -M main
git remote add origin https://github.com/<본인계정명>/ai-camp-week2.git
git push -u origin main
```

자세한 안내는 `ch2-github-repo-guide.md`를 참고합니다.

## 스코프 경계 — 꼭 기억할 것
외부 시스템(정부 사이트·ERP·증권사 등)에 **직접 데이터를 넣거나 조작하는 부분은 자동화 대상에서 뺀다.** 공인인증서·캡차·세션·법적 책임 때문에 어렵고 위험하다. 우리 틀이 커버하는 건 **"그 시스템에 넣을 데이터를 만드는 데까지"** — 실제 제출·업로드·거래는 사람이 한다.

## 이번 주 과제
| 종류 | 내용 | 제출물 |
|---|---|---|
| 사전 (1주차 사후 미제출자) | 타겟 업무 1개 확정 + 골든 데이터 1세트 준비 | `outputs/golden-prepared.md` (또는 골든 파일들) |
| 주차 | 워크스페이스 만들고 골든 데이터 넣고 첫 초안 생성 | `outputs/draft-1.md` + `CLAUDE.md` |
| 사후 | 격차 분석 워크시트 작성 (A4 1매) | `outputs/gap-analysis.md` |
| 선택 | 업무 흐름을 단계 표와 Mermaid 순서도로 정리 | `outputs/workflow-map.md` |
| 필수 | 개인 GitHub 레포지토리 생성 | GitHub 계정명 + 레포지토리 URL |

제출: `npx -y @scaila/camp-cli@latest assignment submit <id> --file outputs/<file>.md` (Claude Code 에게 시켜도 됨) 또는 camp.scaila.kr **[과제] 탭**. 과제 탭에는 GitHub 계정명과 레포지토리 URL도 함께 입력합니다.

## 다음 주 예고
**3주차 — 제약 조건 (지시 체계).** 이번 주에 찾은 "초안 ↔ 골든 격차"를 메우는 5가지 제약 규칙(필수 항목·금지 표현·길이·구조·톤)을 에이전트에 한 겹 더 입힙니다.
