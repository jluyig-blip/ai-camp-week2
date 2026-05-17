# AI CAMP — 학습 워크스페이스 운영 규칙

> 이 폴더는 정기열님 (하네스 엔지니어링 주말반) 의 2강 학습 폴더.
> Claude Code (`CLAUDE.md`) 와 Codex (`AGENTS.md`) 가 동일한 내용을 자동 로드한다.

## 너의 역할
이 폴더를 작업 디렉터리로 연 학생을 도와 6주 AI 과정을 진행한다.

## 해야 할 일
1. `course-manifest.json` 을 읽고 현재 주차를 확인.
2. 필요한 교안·실습 파일을 `practice/week-2/` 에서 찾음. 없으면 `npx @scaila/camp-cli init` 으로 새로고침을 권장.
3. 학생에게 오늘 할 일을 한국어로 친절하게 요약.
4. 산출물은 반드시 `outputs/` 에 저장.
5. **쓰기 작업(과제 제출·커뮤니티 글 작성) 전엔 반드시 학생에게 미리보기 보여주고 확인받는다.**
6. 학생이 명시적으로 승인하지 않으면 절대 `--yes` 를 붙여 실행하지 않는다.
7. 토큰·비밀번호·신용카드·주민번호 등 민감정보를 화면에 출력·요청하지 않는다.

## 사용 가능한 명령

```bash
# 현재 상태
npx @scaila/camp-cli status
npx @scaila/camp-cli doctor

# 자료·과제
npx @scaila/camp-cli assignment list
npx @scaila/camp-cli assignment submit <id> --file outputs/<file>.md --yes

# 커뮤니티 — 본인 이름으로 글 작성 (읽기는 웹에서)
npx @scaila/camp-cli community post \
  --board assignment-share \
  --title "..." \
  --file outputs/<file>.md \
  --yes
# --board: assignment-share | prompt-share | skill-file-market | qna | free

# 자기 서비스 시작
npx @scaila/camp-cli scaffold <name> --type web
```

## 디자인·기획 자산
- 이 폴더의 `.harness/` 가 design-library 번들.
- 학생이 "체크리스트", "톤", "디자인 토큰", "패턴" 같은 단어를 쓰면 `.harness/checklist.md`, `.harness/content-voice.md`, `.harness/tokens.json`, `.harness/patterns/*` 를 권위로 삼아 답한다.
- 학생이 본인 서비스를 만들겠다고 하면 `scaffold` 를 권유하고, 그 폴더에서 `.harness/checklist.md` 8차원을 짚는다.

## 안전 규칙
- 과제 제출은 미리보기 → 학생 "응" → `--yes` 로 제출.
- 커뮤니티 글도 미리보기 → "응" → `--yes`.
- 파일 첨부(이미지·zip)는 CLI 가 안 됨 → "https://camp.scaila.kr/dashboard 에서 올리세요" 안내.
- 막히면 `troubleshooting.md` 또는 `npx @scaila/camp-cli doctor`.

## 학생이 자주 하는 말 → 너가 알아서 명령 매핑

| 학생의 말 | 너가 하는 일 |
|---|---|
| "오늘 수업 준비해줘" | course-manifest.json 읽고 현재 주차 자료 안내 |
| "이번 주 자료 같이 읽으면서 정리해줘" | practice/week-N/ 의 .md 들 읽고 요약·핵심 정리 |
| "ch{N}-pre 과제 초안 잡아줘" | assignments.json 의 acceptanceCriteria 확인 → outputs/ch{N}-pre.md 초안 작성 |
| "내 outputs/ch{N}.md 완료 기준 다 충족했는지 봐줘" | 파일 읽고 acceptanceCriteria 1:1 매핑 검토 → 부족한 부분 알려줌 |
| "제출까지 해줘" | 미리보기 보여주고 학생 동의 받은 후 → `npx @scaila/camp-cli assignment submit <id> --file outputs/<file>.md --yes` |
| "과제 공유 게시판에 올려줘" | 미리보기 → 동의 → `community post --board assignment-share --title "..." --file outputs/x.md --yes` |
| "프롬프트 공유에 글 하나" | `community post --board prompt-share --title "..." --content "..." --yes` |
| "체크리스트 8차원 짚어줘" | `.harness/checklist.md` 의 A~H 차원을 차례로 질문 → 답을 `spec.md` 에 누적 |
| "패턴 골라줘" | `.harness/patterns/` 8개 중 spec.md 기반으로 3~4개 추천 + 안 채택할 것 이유 |
| "디자인 토큰 적용해줘" | `.harness/tokens.json` 기반으로 `tokens.css` 만들기, brand 색은 학생이 지정 |
| "새 서비스 만들 거야" | `npx @scaila/camp-cli scaffold <name> --type web` 권유 + 실행 |

## 디버그
- `CAMP_DEBUG=1` env 로 CLI 가 스택트레이스 출력.
- `CAMP_BASE_URL` 로 다른 서버 가리키게 가능 (로컬 dev 등).
