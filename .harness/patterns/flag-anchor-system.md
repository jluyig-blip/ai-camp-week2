# 패턴 — 플래그 · 앵커 시스템

> AI 검증 결과 "이 부분 문제 있음"을 사용자에게 전달하고, 사용자가 **1초 안에 해당 영역을 확인**할 수 있게 하는 UX.
> 이 라이브러리에서 가장 중요한 패턴 중 하나. 자동화 프로덕트의 품질은 이 루프가 잘 돌면 빠르게 개선됨.

---

## 데이터 스키마 — 플래그 1건

```json
{
  "flag_id": "flag-abc123",
  "component_id": "material-1-1-xyz",
  "flag_type": "SCHEMA | FACT | BORDERLINE | SENSITIVE | CONSISTENCY",
  "severity":  "상 | 중 | 하",
  "location_path": "quiz > quiz.explanation.pipe_three_parts",   // raw id (접힘)
  "reason":    "해설이 파이프(|) 3단 구조 미준수",                 // 무엇
  "guide":     "3번 문항 해설이 정답이유만 있고 오답피드백·실무팁 빠짐", // 어떻게 체크
  "origin_text": "...",    // 발췌
  "resolved":  false,
  "resolution": null       // "regenerated" | "inline_edited" | "dismissed"
}
```

**3대 필수 필드**: `reason` (무엇) · `location_path` (어디) · `guide` (어떻게 체크). 이 셋이 빠지면 플래그 아님.

---

## 카테고리 5종 (자동화 공통)

| 카테고리 | 의미 | 색 토큰 |
|---|---|---|
| FACT | 출처·사실 확인 (위인 어록·통계·인명) | `flag.fact` rose |
| SCHEMA | 서식·규격 위반 | `flag.schema` amber |
| BORDERLINE | AI가 경계선 판정, 사람 확인 필요 | `flag.borderline` indigo |
| SENSITIVE | 민감 표현 가능 | `flag.sensitive` pink |
| CONSISTENCY | 앞뒤·다른 컴포넌트와 모순 | `flag.consistency` emerald |

> 프로젝트마다 일부만 사용해도 됨. 예: "민감 표현" 이슈가 없는 사내용 도구는 4종만.

---

## UI 배치

### 우측 패널 — 플래그 리스트
- 상단 필터 pill 5개 (on/off, 각자 고유 색, 카운트 동반)
- 카드 세로 스택
- 각 카드:
  1. **카테고리 배지** + **심각도** (상=빨강 · 중=주황 · 하=회색)
  2. **위치**: `{영역} · {친근한 항목명}` (raw id 아님)
  3. **무엇** (reason) — bold 한 줄
  4. **어떻게 체크** (guide) — 보통 2~3줄
  5. 수정 지시 textarea
  6. **[재생성]** (검정) · **[무시]** (보더) 버튼
  7. `<details>`로 raw id / AI 판정 원문

---

## 앵커 동작 (가장 중요)

사용자가 플래그 카드 클릭 → 중앙 프리뷰의 **해당 위치로 스크롤 + 하이라이트**.

### 매칭 2단계
1. **구체 아이템 앵커**: `location_path`에 `items[N]` 같은 경로가 있으면 → 해당 카드 1개만 타겟
2. **섹션 매핑**: rubric_id 기반 섹션 매핑 (예: `material.opener.empathy_line_present` → 도입부 섹션)
3. 둘 다 실패 시 → 프리뷰 최상단

### 시각 앵커 스타일
- 좌측 4px **amber 보더**
- 배경 **fef3c7** (노랑 연하게)
- 상단 좌측 **`⚐ 여기를 확인하세요`** 알약 마커
- 0.6초 pulse × 3회 (시선 유도)
- **클릭할 때까지 지속 유지** (스크롤 중 사라지지 않음)
- 다른 플래그 클릭 → 이전 앵커 자동 해제 + 새 위치 표시

### HTML 구조
```html
<!-- 프리뷰 안의 각 섹션 -->
<div data-preview-section="fr-opening">...</div>
<div data-preview-kind="empathy_opener">...</div>

<!-- 개별 아이템 (퀴즈/실습) -->
<div data-preview-item="3" data-preview-type="quiz">...</div>
```

### JS 조합
```js
// 플래그 클릭
jumpToSection(rubricId, rawPath);
// → 우선순위: data-preview-item[N] > rubric-mapped section > body
// → classList.add('hl-anchor') + 마커 insertBefore
// → 컨테이너 기준 scrollTo (smooth)
```

---

## 벌크 처리

- "현재 보이는 플래그 모두 무시" 버튼 (필터·선택 컴포넌트 기준)
- Confirm dialog (건수 명시) → `POST /flags/bulk-resolve`
- 심각도 높은 것(상) 처리 전에 낮은 것 일괄 정리하는 워크플로 유도

---

## 루브릭 ID → 친근 라벨 매핑

- 프로젝트 프런트엔드에 dictionary 유지 (`RUBRIC_LOC`)
- 키: rubric_id (e.g., `material.voice.mentor_persona`)
- 값: `{ area: "학습자료", item: "위인 화법 일관성" }`

이 사전은 프로젝트마다 다름 → [`instances/{project}/rubric-label-dictionary.md`](../instances/)에 저장.

---

## Anti-패턴

- ❌ 플래그를 목록만 보여주고 콘텐츠와 연결 안 하기
- ❌ raw rubric_id를 카드에 그대로 노출
- ❌ 클릭 시 깜빡이기만 하고 실제 위치 표시 없음
- ❌ 자동 스크롤 없이 "알아서 찾으세요"
- ❌ 앵커 표시가 1초만 보이고 사라짐 (못 찾고 놓침)

---

## 관련 원칙

→ [`principles.md`](../principles.md) §3 플래그 3요소, §7 한글 라벨
