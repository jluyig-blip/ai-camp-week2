# 컴포넌트 상태 매트릭스

각 UI 컴포넌트가 가질 수 있는 모든 상태와 전환 조건.

---

## Button

| State | 조건 | 스타일 | 상호작용 |
|---|---|---|---|
| default | 기본 | 배경·텍스트 토큰 색 | hover 가능 |
| hover | 마우스 오버 | bg darken 1 step | - |
| active | mousedown | bg darken 2 step | - |
| focus | keyboard focus | ring-2 | - |
| disabled | `disabled` 속성 | opacity 50, cursor not-allowed | 클릭 무시 |
| loading | 제출 중 | 스피너 아이콘, disabled | 클릭 무시 |

---

## Input / Textarea / Select

| State | 스타일 |
|---|---|
| empty | placeholder 표시 |
| filled | 입력값 표시 |
| focus | ring-2 ring-zinc-900/10 + border-zinc-900 |
| invalid | border-rose-500 + 에러 메시지 하단 |
| disabled | bg-zinc-100, cursor-not-allowed |
| readonly | border 없음, bg-transparent |

---

## Comp Card (Kanban)

| State | label | 색 토큰 |
|---|---|---|
| idle | 대기 | zinc |
| generating | 생성중 | blue |
| validating | 검증중 | amber |
| passed | 통과 (N점) | emerald |
| flagged | 플래그 (N점) | rose |
| regenerating | 재생성 #N | amber (pulse) |
| error | 오류 | red |

**전환**:
- generating → validating (component.generated)
- validating → passed or flagged (component.validated)
- flagged → regenerating (수동 또는 자동 재시도)
- regenerating → validating (component.generated, 새 버전)

---

## Flag Card

| State | 스타일 |
|---|---|
| default | 흰 배경, hover bg-zinc-50 |
| selected | 좌측 3px border 색 지속 |
| resolving | 재생성 중 반투명 + 스피너 |
| resolved | 리스트에서 제거 (혹은 strikethrough로 잠시 표시 후 제거) |

---

## Step Indicator

| State | 색 |
|---|---|
| future | zinc-400 (회색 원·라벨) |
| current | zinc-900 (검정 원·흰 숫자 + 라벨 진함) |
| done | emerald-600 (초록 원·흰 체크) |
| blocked | rose-500 (빨강, 오류 표시) |

---

## Preview Section (Material/Quiz/Practice 아이템)

| State | 스타일 |
|---|---|
| default | border-zinc-200, padding-4 |
| anchored | hl-anchor 클래스 적용 (amber 배경, 좌측 4px 보더, ⚐ 마커) |
| pulsing | hl-anchor + pulse 애니메이션 (0.6s × 3회) |

---

## Pane Divider (3-Pane 드래그 핸들)

| State | 스타일 |
|---|---|
| default | 4px 투명 배경, 색점선 힌트 |
| hover | 색 진해짐 (zinc-400) |
| dragging | 색 가장 진함 + body에 `cursor-col-resize` 고정 |

---

## Run Pill (Top bar)

| State | dot 색 | 라벨 |
|---|---|---|
| planning | zinc | "기획 중" |
| awaiting_approval | zinc | "승인 대기" |
| generating | blue | "생성 중" |
| reviewing | emerald | "검토" |
| deployed | emerald | "배포됨" |
| error | rose | "오류" |
| aborted | zinc | "중단" |

---

## Toast

| State | 색 | 수명 |
|---|---|---|
| ok | emerald 배경, 흰 텍스트 | 3초 |
| err | rose 배경 | 5초 (길게) |
| info | zinc | 3초 |

---

## Run Row (사이드바 히스토리)

| State | 스타일 |
|---|---|
| default | 평범 |
| active (현재 열린 run) | bg-zinc-100 |
| hover | bg-zinc-50 + × 버튼 노출 |
| deleting | 옅은 빨강 배경 + 스피너 (비동기 삭제 중) |

---

## 사용 가이드

새 컴포넌트 설계 시:
1. 이 문서에 state 목록 먼저 정의
2. 각 state의 **조건(언제)** + **스타일(어떻게)** + **전환(다음 state)** 기재
3. 최소 3-4개 state 이상 나오면 state machine 다이어그램 그리기

---

## 관련 원칙

→ [`principles.md`](../principles.md) §5 시맨틱 색상
