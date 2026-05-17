# .harness/ — Design Library Bundle

> 이 폴더는 **자동화·웹 서비스 만들 때 참고하는 자산집**이다.
> camp-cli 가 워크스페이스마다 깔아주는 것 = AI World Harness 에서 추출 → APEX/camp-lms 로
> 다듬어진 v1 라이브러리.

## 구조

```
.harness/
  VERSION                       # 버전 ID
  principles.md                 # 자동화 UX 8원칙
  checklist.md                  # 서비스 기획 8차원 체크리스트 (1주차 교안 프레임)
  tokens.json + tokens.md       # 색·타이포·간격·반경·shadow·motion·layout
  components/catalog.md         # 원자·분자·유기체 카탈로그
  patterns/                     # 자동화 인터랙션 패턴 9개
    cross-validation-ui.md
    agent-status-kanban.md
    flag-anchor-system.md
    item-and-batch-regeneration.md
    editable-blueprint-review.md
    websocket-live-progress.md
    three-screen-flow.md
    tiered-input-layout.md
    agent-cli-companion.md      ← camp-cli 가 보여주는 신규 패턴
  screens-reference.md          # Control / Execution / Review 3-Screen 템플릿
  flows-reference.md            # 주요 유저 플로우
  state-matrix.md               # 컴포넌트별 상태 표
  content-voice.md              # UX 카피 원칙
  a11y-and-specs.md             # 접근성·반응형·애니메이션
  instances/
    _template/                  # 새 프로젝트 시작 시 복사할 골격
    camp-lms/                   # (선택) camp-lms 본진의 instance
```

## 학습 중에는

읽기 전용 참고. 에이전트한테:
- "checklist.md 의 8차원으로 내 과제 정리해줘"
- "patterns/ 중에 회의록 요약 하네스에 쓸만한 거 골라줘"
- "tokens.json 의 status 색을 내 슬라이드에도 적용"

## 자기 서비스 만들 때는

```bash
npx @scaila/camp-cli scaffold my-service --type web
```
하면 이 폴더가 통째 복사돼서 새 프로젝트 시작점이 된다. 그 다음 에이전트한테:
1. "checklist 8차원 짚으면서 spec.md 채워줘"
2. "tokens.json 의 brand 만 내 색으로 바꿔 tokens.css 갱신"
3. "patterns/ 중 3~4개만 골라서 적용 계획"
4. "components/catalog.md 보고 src/components/ui/ 만들기"
5. "patterns/agent-cli-companion.md 패턴으로 내 사용자도 CLI 쓸 수 있게"

상세 단계는 `checklist.md` 머리말과 CLAUDE.md 참고.

## 버전 관리

`VERSION` 파일이 현재 번들 버전. 갱신:
```bash
npx @scaila/camp-cli library update    # (TODO — 추후)
```
