# 사용자 플로우 레퍼런스

주요 유저 저니 5개 + 각 플로우의 happy path와 edge cases.

---

## Flow 1 · 신규 작업 생성

```
[Control 입력] → [Generate 클릭]
                      ↓
              [Execution 자동 전환]
                      ↓
         [Director Loading 15~40초]
                      ↓
         [Blueprint 편집 폼 표시]
                      ↓
             사용자 수정·확인
                      ↓
               [승인 + 생성 시작]
                      ↓
    [컴포넌트 병렬 생성 + Kanban 관찰]
                      ↓
             run.completed 이벤트
                      ↓
             [Review 자동 전환]
```

**Edge cases**:
- 필수 필드 누락 → 토스트 에러, 제출 차단
- API 키 invalid → blueprint.error 이벤트 → 에러 배너
- 모델 rate limit → 재시도 안내 → 자동 retry

---

## Flow 2 · 플래그 해결

```
[Review 탭 이동]
      ↓
[좌측 트리에서 컴포넌트 선택]
      ↓
[우측 플래그 카드 리스트 확인]
      ↓
[카드 1개 클릭]
      ↓
[중앙 프리뷰가 해당 위치로 스크롤 + 앵커 표시]
      ↓
 ┌── 판단 ───────────────────────┐
 │ (1) 진짜 문제 → 재생성        │
 │ (2) 괜찮음 → 무시              │
 │ (3) 직접 고치고 싶음 → 인라인  │
 └─────────────────────────────────┘
```

### (1) 재생성 분기
```
수정 지시 textarea 입력 (선택)
      ↓
[재생성] 클릭
      ↓
component.regenerating 이벤트
      ↓
새 버전 생성 + 검증
      ↓
토스트 "새 버전 생성 완료"
      ↓
Review 데이터 자동 갱신
```

### (2) 무시 분기
```
[무시] 클릭
      ↓
/api/flags/{id}/resolve (dismissed)
      ↓
플래그 리스트에서 제거
      ↓
다음 플래그 자동 포커스
```

### (3) 인라인 편집 (차후 구현)
```
편집 모드 진입
      ↓
필드 직접 수정
      ↓
[저장] → DB 업데이트 + 플래그 resolved(inline_edited)
```

---

## Flow 3 · 챕터 단위 재생성 (피드백 기반)

```
[컴포넌트 선택 — 학습자료·퀴즈·실습 중 하나]
      ↓
프리뷰 헤더 [⟳ 이 챕터 전체 재생성] 클릭
      ↓
amber 패널 펼침
      ↓
피드백 textarea 입력
      ↓
체크박스: 학습자료 / 퀴즈 / 실습 중 재생성할 것 선택
      ↓
[재생성 시작] 클릭
      ↓
순차 생성: material → quiz → practice
  (각 단계 교차검증 1회)
      ↓
새 버전들이 최신 버전으로 표시
      ↓
chapter.regen_completed 이벤트
```

---

## Flow 4 · Run 관리 (히스토리)

```
[사이드바 "최근 RUN" 리스트 표시]
      ↓
 ┌── 행동 ─────────────────┐
 │ 항목 클릭 → run attach │  ← 해당 run의 상태로 전환
 │ × 버튼 hover → 삭제     │  ← confirm → cascade delete
 └──────────────────────────┘
```

**Cascade 삭제 대상**:
- components / validations / flags / blueprints / regenerations / runs 자체

---

## Flow 5 · 다운로드

```
[Review 상태 run 선택]
      ↓
TopBar "↓ .xlsx 다운로드" 버튼
      ↓
[클릭] → /api/runs/{id}/export.xlsx
      ↓
브라우저 파일 다운로드
      ↓
(필요 시) 개별 material 컴포넌트 선택
      ↓
프리뷰 헤더 [.docx] 버튼
      ↓
해당 챕터 학습자료 docx 다운로드
```

---

## Flow 6 · 에러 복구

공통 에러 패턴:

```
에러 발생 (API 401 / 모델 404 / 서버 500)
      ↓
전역 에러 배너 노출 (top-0 fixed, rose)
      ↓
에러 메시지 명시: [타입] 요약 + 세부
      ↓
사용자 행동:
  - 배너 × 닫기
  - .env 수정 → uvicorn 자동 재시작
  - 브라우저 새로고침 → 재접속
```

---

## 관련 문서

- 3-Screen 구성: [`03-screens-reference.md`](./03-screens-reference.md)
- 재생성 상세: [`02-patterns/item-and-batch-regeneration.md`](./02-patterns/item-and-batch-regeneration.md)
- 플래그 시스템: [`02-patterns/flag-anchor-system.md`](./02-patterns/flag-anchor-system.md)
