# 고객문의-자동응답 — 마스터 프롬프트 (1주차 계획 → MVP 골격)

너는 이 학생의 1주차 자동화 계획을 받아서, 실제로 보이는 최소 MVP 한 페이지를 만든다.
Claude Code 와 Codex 가 동일하게 이 문서를 따른다(`AGENTS.md` 동일).

## 1) 계획 읽기
`plan.md` 에 1주차 제출물이 들어 있다 (LMS 에서 자동으로 끌어온 것):
타겟 업무 / AI가 할 일·사람이 할 일 / 기대 산출물 / 선정한 후보 설명.
plan.md 가 비어 있으면 학생에게 "1주차 계획을 plan.md 에 붙여넣어 주세요" 라고 요청한 뒤 진행.

## 2) spec.md 채우기
`.harness/checklist.md` 8차원 중 **A(목적)·B(콘텐츠 모델)·C(사용자)·F(화면)** 을 plan.md 에서
끌어낼 수 있는 만큼 채워 `spec.md` 에 저장한다. 비는 칸은 학생에게 *한 번에* 물어본다.
D·G·H 는 "5~6주차" 로 표시만 하고 비워둔다.

## 3) index.html 채우기 (이미 1페이지 골격이 있다)
`index.html` 의 다음 자리를 학생 도메인으로 바꾼다:
- `[SERVICE_NAME]` / `[ONE_LINE_DESCRIPTION]` — 학생 자동화 이름·한 줄 설명
- `[INPUT_LABEL]` / `[INPUT_PLACEHOLDER]` — 실제 입력 (예: "고객 리뷰 붙여넣기" / 샘플 리뷰)
- `[OUTPUT_TITLE]` / `[SAMPLE_OUTPUT]` — expected_result 형식 (예: "분류 결과 + 답글 초안" / golden/output-example.md 내용)
- `--brand` / `--accent` 색을 학생 취향대로 (tokens.css 의 brand 색과 맞춤)
- ⚠️ 외부 시스템(정부사이트·ERP·증권사 등)에 직접 게시·제출하는 코드는 절대 넣지 않는다 — 출력 표시까지만.
- 라우팅·DB·로그인·어드민은 만들지 않는다 (5~6주차). 지금은 input→실행→output 한 페이지.

## 4) golden/ 만들기
`golden/input-example.md`, `golden/output-example.md` 빈 파일을 만들고(이미 있으면 둠),
학생에게 "실제 입력 1~3건 + 이상적 출력 1~2건을 넣으세요" 라고 안내한다(`ch2-golden-data-template.md` 참고).

## 5) 첫 초안
학생이 golden/ 을 채우면 → "golden/ 보고 새 입력에 대한 첫 초안 만들어줘 → outputs/draft-1.md".
그 다음 index.html 의 출력 패널에 그 결과를 반영하고, 학생에게 `open index.html` 로 확인하라고 안내.

## 절대 규칙
- 화면은 1페이지 골격. 라우팅·DB·로그인·어드민은 5~6주차.
- API 키는 `.env` 에 (코드 하드코딩·화면 출력 금지). 실행 로직은 5~6주차에 연결 — 지금은 Claude Code 가 직접 초안을 만든다.
- 학생 승인 없이 외부 동작(게시·전송·결제 등) 금지.
- 디자인 결정은 `.harness/tokens.json` + `.harness/principles.md` 부터. UX 는 `.harness/patterns/` + `.harness/content-voice.md`.
- 변경 기록은 `.harness/instances//` 에.

## 다음 단계 (학생에게 알려줄 것)
- 3주차: 제약 조건 — spec.md 의 규칙을 더 박는다.
- 4주차: 출력 제어 — 출력 템플릿 고정.
- 5주차: 에이전트 다중화 + 평가 루프 — 단계가 많으면 `.harness/patterns/agent-status-kanban.md` 패턴(github.com/Zakedu/kanban-system)으로 펼친다.
- 6주차: Demo Day & 운영 — index.html 을 여러 페이지·어드민·실제 로직으로 확장 + 배포.
