# 패턴 — 교차검증 UI

> "이 결과는 A 모델이 만들고 B 모델이 검증했다"를 **UI에 명시**하는 방법.
> 왜: 사용자가 "AI 하나가 혼자 한 건 아닌지" 불안감을 없애기 위함 + 책임 소재 명확.

---

## 기본 규칙

- 모든 생성 컴포넌트 카드에 **`생성자 모델 → 검증자 모델`** 표기 (mono 폰트)
- 생성/검증 매트릭스는 **config로 관리** (프로젝트 초반에 결정, 이후 가능한 고정)
- **한 모델이 자기 출력을 자기가 검증하지 않기** — blind spot 방지

---

## 시각적 구성

### 컴포넌트 카드 (Kanban)
```
┌─────────────────────────────┐
│ 학습자료 · 1-1     [통과 95]│
│ 'Water'의 기적 — …          │
│ claude → openai             │  ← 작게, mono, 회색
└─────────────────────────────┘
```

### ContentPreview 헤더
```
퀴즈 · 1-1 · 챕터명           [점수 92] [openai → claude]
```

### Log 이벤트
```
[16:23:41] component.generating  {type:material, gen:claude}
[16:24:12] component.generated   {type:material, cid:...}
[16:24:35] component.validated   {passed:true, score:95, val:openai}
```

---

## CROSS_MATRIX 예시

```python
# config.py
CROSS_MATRIX = {
    "course_overview":   ("claude", "openai"),   # 기획은 긴 컨텍스트 → Claude
    "figure_rationale":  ("openai", "claude"),
    "material":          ("claude", "openai"),
    "quiz":              ("openai", "claude"),   # 서식 안정성 → GPT
    "practice":          ("claude", "openai"),
}
```

- 한 프로젝트 내에서 **컴포넌트별로 방향을 엇갈리게** 배치 (blind spot 상쇄)
- 초기 설정 후 **PoC 3~5회 돌려보고** 품질 편차 따라 재튜닝

---

## 재튜닝 시그널 (언제 매트릭스를 바꾸나)

- 특정 컴포넌트가 반복해서 flagged → 해당 생성 모델을 반대로 스왑
- 검증자가 생성자 출력을 너무 후하게 통과시킴 → 더 엄격한 모델로 교체
- 같은 종류의 플래그 사유가 계속 반복 → 시스템 프롬프트 강화 or 모델 변경

---

## Anti-패턴

- ❌ `claude-opus-4-7 → gpt-5.4` 같은 기술 ID를 사용자에게 그대로 노출 (친근 이름 따로)
- ❌ 생성·검증 모두 같은 모델 (의미 없는 "검증")
- ❌ 검증 결과 점수만 표시하고 어느 모델 판정인지 표기 안 함

---

## 관련 원칙

→ [`principles.md`](../principles.md) §2 생성 과정 시각화, §5 시맨틱 색상
