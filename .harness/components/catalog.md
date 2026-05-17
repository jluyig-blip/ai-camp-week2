# 컴포넌트 카탈로그

AI World Harness를 구축하며 검증된 UI 컴포넌트 목록.
각 항목에 **목적·상태·사용 예시** 기재. 다른 자동화 프로덕트에 그대로 이식 가능.

---

## Atoms (원자)

### Button
- **Variants**: `primary` (검정 배경·흰 글씨) · `secondary` (보더·흰 배경) · `accent` (emerald) · `danger` (rose) · `ghost` (투명)
- **States**: default / hover / active / focus / disabled / loading
- **사이즈**: sm (py-1.5 px-3) / md (py-2 px-4) / lg (py-2.5 px-6)
- **사용**: Generate / 승인 / 재생성 / 무시

### Input
- **Types**: text / number / select / textarea / range(slider)
- **States**: empty / typing / focus(ring) / valid / invalid / disabled
- **Focus ring**: `ring-2 ring-zinc-900/10 border-zinc-900`
- **Placeholder 원칙**: 실제 예시 문장 ("예: 앤 설리번")

### Badge / Pill
- `status` (작업 상태 표시) · `flag` (플래그 카테고리) · `severity` (심각도 상/중/하) · `count` (숫자 배지)
- 반드시 토큰 기반 색 (hardcode 금지)

### Spinner / Skeleton
- Spinner: `animate-spin` + 4px 보더 링 (zinc-200 → zinc-900)
- Skeleton: `shimmer` 애니메이션 (1.2s infinite)

### Divider
- Horizontal: `h-px bg-zinc-200`
- Drag-resize: 4px wide, cursor col-resize, hover 시 색 진해짐

### KBD (키보드 단축키 힌트)
- `font-mono text-[11px] px-1.5 border border-b-2 bg-zinc-50 rounded`
- 예: `↑↓` `R` `D`

### Icon
- 전부 **inline SVG**, 24x24 viewBox, `stroke-width=2`
- lucide-react 스타일 (외부 의존성 없이)

---

## Molecules (분자)

### NavItem (사이드바 링크)
- Icon + 텍스트 + 우측 badge(선택)
- States: default / hover / active(검정 배경)

### FilterPill (on/off 토글 배지)
- 타입 배지 색 + 카운트 숫자
- off일 때 회색·dim 처리

### StepIndicator (스테퍼의 원형 + 라벨)
- States: future(회색) / current(검정·채워진 원) / done(초록·체크) / blocked

### StatusBadge
- 색상 점(dot) + 라벨. 컴포넌트 카드 우측 상단에.

### RunRow (사이드바 히스토리 한 줄)
- 상태 dot + run_id (mono) + 위인·주제 요약 + hover 시 × 삭제 버튼

### Toast
- 위치: `fixed bottom-4 right-4`
- 자동 사라짐 3초 후
- `ok` (emerald) / `err` (rose) / `info` (zinc)

### Table Column Resizer
- `<th class="relative">` + `<span class="col-resizer">` 우측 모서리
- 드래그로 폭 조정, `table-layout: fixed` 필수

---

## Organisms (유기체 — 화면 구성 단위)

### Sidebar
- 로고(40x40) + 세로 nav(3~5개) + 최근 히스토리 리스트 + 하단 시스템 상태(모델 health)
- 폭: 240px 기본 · 드래그 리사이저로 200~400 조절

### TopBar
- Breadcrumb(제목+서브텍스트) 좌측 · Action pill(run ID·상태)과 Download 버튼 우측
- 높이: 56px

### Stepper
- 5단계 이하 권장. 가로 배치. 각 단계 `future/current/done` 상태.

### StatsBar
- 5-card row, 각 카드에 `[ label ]` + `✓N ⚠N …N` 요약
- 자동화 프로덕트에선 "진행/완료/대기/오류" 카운트 한눈에

### KanbanColumn
- 상단 label + count, 아래에 카드 스택
- **4컬럼이 기본**: 생성중 / 검증중 / 통과 / 플래그

### CompCard (Kanban에 들어가는 컴포넌트 카드)
- 한글 타입명 + 챕터/위치 + 상태 배지 + 생성자→검증자 모델 라벨

### FlagCard
- 카테고리 배지 + 심각도 + "⚐ 이 부분 보기" (amber)
- 위치(영역·항목) / 무엇 / 어떻게 체크
- textarea + 재생성/무시 버튼
- raw ID는 `<details>`에 접어둠

### NavTree (커리큘럼 트리)
- 파트 → 챕터 → 컴포넌트 3단 트리
- 각 노드에 플래그 카운트 배지 + 상태 라벨
- 선택된 노드 배경 반전 (검정 배경·흰 글씨)

### ContentPreview
- 유형별 서로 다른 렌더:
  - **figure_rationale** 스타일: blockquote + heading + 에피소드 카드
  - **material** 스타일: 섹션별 heading + kind badge + 본문
  - **quiz** 스타일: 문항 카드 10개 (유형·난이도 배지 + 보기 `<pre>` + 정답/힌트/해설)
  - **practice** 스타일: 실습 카드 (stage·난이도·합격점수 배지 + 문제/설명/good-better 정답/평가항목)
- 모든 섹션에 `data-preview-section`/`data-preview-item` 앵커 속성

### AnchorMarker
- `⚐ 여기를 확인하세요` 주황 알약 배지 + 좌측 4px amber 보더 + 노란 배경
- 펄스 0.6s × 3회 애니메이션 (주의 끌기 후 지속 유지)

### EventLog
- `<details>` 접이식 기본 접힘
- 라인: `[HH:MM:SS] {event.type} {payload 일부}` 색상 (에러=rose, 성공=emerald, 재생성=amber)

### Form Sections (기획서 편집)
- 4섹션 구조: 기본정보 · 수강대상 · 수강효과 · 커리큘럼 테이블
- 각 섹션 border-box + 회색 라벨 + 필드

### ChapterRegenPanel
- amber 배경 · 제목(챕터 번호) · textarea(피드백) · 컴포넌트 체크박스 · 시작/취소

### 3-Pane Layout
- 좌: Nav (고정 폭, 드래그 가능) · 중: Preview (flex-1) · 우: Action (고정 폭, 드래그 가능)
- 두 divider, localStorage로 폭 기억

### ErrorBanner
- 전역 `position: fixed top-0`, 빨간 배경, 닫기 × 버튼

---

## 사용 가이드

- **원자 단위로 시작**: 새 화면 만들 때 원자(버튼·인풋·배지)부터 토큰 맞게 쓰고 조립
- **분자는 재사용 단위**: NavItem, FilterPill, StatusBadge는 여러 화면에서 똑같이 등장
- **유기체는 프로젝트 단위**: Kanban / FlagCard / 3-Pane은 자동화 프로덕트에 공통, **구성 세부(컬럼 수·카테고리 수)만 바꿔** 쓰면 됨

---

## 새 컴포넌트를 추가할 때

1. 원자/분자/유기체 중 어디에 속하는지 판단
2. **토큰만 사용** (hardcoded 색 금지)
3. 최소 3개 상태 정의 (default/hover/active 또는 empty/filled/error)
4. 이 문서에 한 줄 추가
