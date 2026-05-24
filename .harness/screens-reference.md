# 3-Screen Reference — Control / Execution / Review

자동화 프로덕트의 표준 3화면 템플릿. 세부는 [`02-patterns/three-screen-flow.md`](./02-patterns/three-screen-flow.md) 참고.

---

## 공통 Shell

모든 화면에 공통으로 존재:

```
┌── Sidebar ───┬── Main Content ────────────────────┐
│ Logo         │ ┌ TopBar ────────────────────────┐│
│ Nav 3개      │ │ Breadcrumb + Run pill + Action││
│ ────────     │ └──────────────────────────────────┘│
│ 최근 RUN     │ ┌ Stepper (Execution·Review만) ──┐│
│ 리스트       │ └──────────────────────────────────┘│
│ ────────     │                                    │
│ 모델 상태    │   [Screen 고유 내용]               │
│              │                                    │
└──────────────┴────────────────────────────────────┘
```

### Sidebar
- **Logo**: 작은 사각 아이콘 + 제품 이름
- **Nav 3개**: 주 기능 라우팅 (Control · Execution · Review)
- **최근 RUN**: 히스토리 리스트 (상태 dot + 요약) + hover × 삭제
- **모델 상태**: Claude / GPT 등 연결 상태 dot

### TopBar
- **Breadcrumb**: 현재 화면 제목 + 한 줄 설명
- **Run pill**: 현재 활성 run의 id + 상태 (있을 때만)
- **Action**: Download 버튼 (reviewing 상태 시 노출)

### Stepper
- 5단계: 1 입력 → 2 기획 → 3 생성·검증 → 4 검토 → 5 배포
- 현재/완료/미래 3상태

---

## Screen 1 · Control

**목적**: 새 작업의 입력값 지정 + 시작

**주요 컴포넌트**:
- 3개 카드 섹션 (Tier 1 / Tier 2 / Tier 3 프리셋)
- Primary 버튼 `생성 시작`
- 예상 소요시간 안내 텍스트

**상태**:
- Empty (처음): 모든 필드 빈 상태, placeholder만
- Filling: 사용자 입력 중
- Invalid: 필수 필드 누락 시 → 토스트 에러
- Submitting: 버튼 눌림 → 탭 자동 전환

---

## Screen 2 · Execution

**목적**: 실시간 생성·검증 관찰 + 중간 승인

**주요 컴포넌트**:
- StatsBar (5-card row)
- Director Card (Idle/Loading/Form)
- Kanban (4 columns)
- Event Log (접이식)

**상태**:
- Idle: run 시작 전
- Director Loading: 기획서 생성 중
- Awaiting Approval: 기획서 완료, 사용자 승인 대기
- Generating: 승인 후 컴포넌트 병렬 생성
- Reviewing 전환: 완료 시 자동 Review 탭 이동

---

## Screen 3 · Review

**목적**: 플래그 기반 검토 + 재생성/무시 + 최종 승인

**주요 컴포넌트**: (3-Pane 참조)
- Navigator Tree (좌)
- Content Preview (중, 타입별 렌더)
- Flag & Action Panel (우)

**상태**:
- Empty: run 미선택
- Loading: 컴포넌트 fetch 중
- Selected: 노드 선택됨, preview·flags 표시
- Anchored: 플래그 클릭으로 앵커 활성

---

## 다른 자동화 프로덕트에 적용 시

각 Screen의 **역할은 동일**, **콘텐츠 템플릿만 교체**:

### 예: 마케팅 카피 자동화
- Control: 브랜드/제품/타깃/톤
- Execution: 30개 변형 병렬 생성 Kanban
- Review: 브랜드 가이드 위반/민감어/중복 플래그 검토

### 예: 법률 조항 리뷰
- Control: 문서 업로드 + 검토 기준
- Execution: 조항별 AI 분석 진행
- Review: 리스크·모순·누락 플래그 검토

### 예: 이미지 데이터셋 분류
- Control: 레이블 정의 + 샘플
- Execution: 배치 분류 진행
- Review: low-confidence 이미지 수동 검토

---

## 관련 문서

- 토큰: [`00-foundation/tokens.md`](./00-foundation/tokens.md)
- 컴포넌트: [`01-components/component-catalog.md`](./01-components/component-catalog.md)
- 3-Screen 상세: [`02-patterns/three-screen-flow.md`](./02-patterns/three-screen-flow.md)
