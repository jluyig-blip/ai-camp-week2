# 패턴 — 편집 가능한 기획서 검토

AI가 생성한 구조화된 결과물(기획서, 계획서, 분류 결과 등)을 사용자가 **JSON 덤프가 아닌 편집 가능한 폼**으로 확인·수정한 뒤 승인.

---

## 왜 이렇게 하나

- AI 생성 초안은 거의 대부분 **사용자가 일부만 수정**하고 나머지는 유지
- raw JSON은 읽기 어렵고 편집 위험 (문법 깨지면 전체 실패)
- 폼으로 보여주면 수정 지점 명확 + 타입별 validation 가능

---

## UI 원칙

1. **4개 섹션으로 분할** (기본정보 / 리스트1 / 리스트2 / 테이블)
2. 각 섹션은 `<div class="border rounded p-3">`로 박스화
3. **label + input** 쌍. label은 회색·medium weight.
4. 입력 타입은 데이터 종류에 맞게:
   - 짧은 문자열 → `<input type="text">`
   - 긴 문자열 → `<textarea rows="2~3">`
   - 제한된 선택 → `<select>` (카테고리 등)
   - 숫자 제한 → `<input type="number" min max>`
   - 리스트(3~5개 고정) → 번호 붙은 textarea 반복

---

## 커리큘럼 테이블 (예시)

```
┌─ 4. 커리큘럼 (5파트 × 2챕터 = 10챕터) ──────┐
│ 구분 | 파트명         | 챕터명  | 기법     │
│ 1-1  | [input text]   | [...]   | [...]    │
│ 1-2  | [input text]   | [...]   | [...]    │
│ ...                                         │
└─────────────────────────────────────────────┘
```

- 구분(chapter_id)은 **수정 불가** (자동 생성 규칙 유지)
- 나머지 셀은 `<input>`로 편집 가능
- **컬럼 폭 리사이저** 필수 (각 th 우측 드래그 핸들)
- `table-layout: fixed` + th 명시 `width` 있어야 리사이즈 작동

---

## 상태 머신 (3-state)

```
bp-idle    ← 초기
  ↓ (Generate 클릭)
bp-loading ← 스피너 + skeleton
  ↓ (blueprint.completed 이벤트)
bp-form    ← 편집 가능 폼
  ↓ (승인 클릭)
승인 완료 ← 폼 disabled + 버튼 "승인 완료" 텍스트
```

### Idle
```
대기 중 — Control에서 Generate를 누르세요
```

### Loading
- 스피너 + "Director가 기획서를 작성하고 있습니다…" + "약 15~40초 소요"
- 하단에 skeleton shimmer 3줄

### Form
- 녹색 배지 "✓ 생성 완료 — 검토 후 승인"
- 편집 가능 필드
- `[수정 반영 + 승인 → 생성 시작]` (emerald) + `[같은 입력으로 다시 생성]` (보더)

### 승인 완료
- 모든 input/textarea/select `disabled`
- 버튼 텍스트 "✓ 승인 완료 — 컴포넌트 생성 시작됨" (disabled)
- 스테퍼 다음 단계로 이동

---

## 폼 → JSON 직렬화

사용자가 "승인" 클릭 시:
1. 모든 필드 값 수집 (`collectBlueprintForm()`)
2. 서버로 `POST /api/runs/{id}/approve-blueprint` with `content: {...}`
3. 서버는 수정된 content로 DB 업데이트 후 orchestrator 호출

```js
function collectBlueprintForm() {
  return {
    course_name: $('f-course_name').value.trim(),
    category:    $('f-category').value,
    targets:     Array.from(document.querySelectorAll('[data-targets]')).map(x => x.value),
    curriculum:  [...], // 테이블에서 수집
    // ...
  };
}
```

---

## 재생성 버튼 2종

- **"수정 반영 + 승인"** (primary, emerald) — 편집한 내용을 반영한 뒤 다음 단계로
- **"같은 입력으로 다시 생성"** (ghost, 보더) — 편집한 내용 버리고 동일 입력으로 기획서 새로 생성

---

## Anti-패턴

- ❌ JSON 덤프를 `<pre>`에 그대로 던지기
- ❌ 편집 안 되고 읽기만 가능
- ❌ 승인 버튼 눌러도 편집한 값 무시 (초기 생성본으로 진행)
- ❌ 필드 타입 맞지 않게 (긴 본문에 `<input type="text">`)
- ❌ 컬럼 폭 고정 → 긴 텍스트 잘림

---

## 관련 원칙

→ [`principles.md`](../principles.md) §1 개입 지점, §8 편집성
