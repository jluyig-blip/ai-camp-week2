# HANDOFF — ATTRANGS CS 자동응답 에이전트

> 최종 업데이트: 2026-05-30  
> 작성자: Claude Code (세션 인계용)  
> 학생: 정기열 (AI 하네스 6주 완주반)

---

## 현재 상태 한 줄

**3주차 완료** — WMS API 4개 tool use 연동 + 시스템 프롬프트 강화(TONE-REVIEWER·RISK-CHECKER) 완료.  
4주차 진입 직전.

---

## 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 서비스명 | ATTRANGS CS 자동응답 에이전트 |
| 목표 | 네이버 톡톡·카카오 상담톡 고객문의 → AI 유형 분류 + WMS 조회 + 답변 초안 자동 생성 |
| AI 담당 | 재고·주문상태·반품·취소 조회 → Tier1 자동 답변 초안 |
| 사람 담당 | 반품·교환 최종 승인, 분쟁·VIP·악성고객 예외 케이스 |
| GitHub | https://github.com/jluyig-blip/ai-camp-week2 |
| 주요 디렉토리 | `C:\Users\yj-pl\ai-camp-week2\` |

---

## 주요 파일 맵

```
ai-camp-week2/
├── index.html              ← MVP 메인 1페이지 (입력→실행→출력)
├── dashboard.html          ← 대시보드 (위젯 6개)
├── danger-alert.html       ← 위험케이스 알림 페이지
├── inquiry-list.html       ← 문의 목록 + 검색
├── src/server.js           ← Express 서버 (WMS API tool use 루프)
├── prompts/system.md       ← 시스템 프롬프트 (TONE-REVIEWER + RISK-CHECKER)
├── prompts/output-template.md ← 출력 템플릿
├── golden/
│   ├── input-example.md    ← 실제 입력 10건
│   └── output-example.md   ← 이상적 출력 10건
├── outputs/draft-1~14.md   ← AI 생성 초안 이력
├── llm_guide.md            ← WMS API 4개 엔드포인트 + tool 정의
├── spec.md                 ← 서비스 스펙 (A·B·C·E·F 완성, D·G·H 미작성)
├── plan.md                 ← 1~3주차 과제 제출 이력
├── cs자동화/               ← 칸반보드 하네스 (포트 8080)
└── HANDOFF.md              ← 이 파일
```

---

## 완료된 작업 (커밋 기준)

| # | 내용 | 커밋 |
|---|---|---|
| 1 | MVP 완성 (CS 자동응답 에이전트 1페이지) | `028a43f` |
| 2 | 배송지연 자동답변 템플릿 + 케이스 3 추가 | `d1824b3`, `9b039f1` |
| 3 | 배송문의 확정 로직 + 골든셋 #011 추가 | `366c7bb` |
| 4 | 주소변경·옵션변경 케이스 추가 | `b56e076`, `8f89e25` |
| 5 | 주문 전 배송 가능 여부 답변 로직 상세화 | `7541711` |
| 6 | 고객문의 자동응답 위젯 6개 추가 | `b98d818` |
| 7 | 칸반보드 GitHub Pages 배포 링크 통합 | `a9e1cd5` |
| 8 | danger-alert 전면 재구성 + 위험케이스 카드 링크 | `b2e8e72` |
| 9 | 문의 목록 검색 기본값 전체 필드 변경 | `f729843` |
| 10 | 3주차 위클리 과제 완료 제출 | `73bdf63` |
| 11 | **WMS API 4개 연동** (stock·order_status·return·cancel) | `5574c73` |
| 12 | **시스템 프롬프트 강화** (TONE-REVIEWER C1~C14, RISK-CHECKER R8종) | `5574c73` |

---

## 현재 작동 방식

```
고객 문의 입력 (index.html)
  ↓
Express 서버 (src/server.js, 포트 3000)
  ↓
Claude claude-sonnet-4-x + tool use
  ↓ (필요 시 API 호출)
  ├─ get_stock       → attrangs.co.kr/api/cs/stock.php
  ├─ get_order_status → attrangs.co.kr/api/cs/order_status.php
  ├─ simulate_return  → attrangs.co.kr/api/cs/return.php
  └─ simulate_cancel  → attrangs.co.kr/api/cs/cancel.php
  ↓
답변 초안 생성 → outputs/draft-N.md 저장
  ↓
화면 출력 (상담원 검토 → 발송)
```

**칸반보드 서버**: `cs자동화/` 디렉토리, 포트 8080  
→ `cd cs자동화 && npm start`

---

## 3주차 제약 조건 (현재 적용 중)

1. **API 조회 결과 필수 포함** — 배송·반품·취소 문의 시 `[API 조회 결과]` 섹션 답변 앞에 출력. 실패 시 "API 조회 실패 — 수동 확인 필요" 명시
2. **API 응답값만 사용, 추측 금지** — `status_text`, `refund.total`, `delay_until` 등 실값만 사용. `delay_until`이 오늘 이전이면 CS 인계
3. **시뮬레이션 후 동의 확인 필수** — `return.php`·`cancel.php`는 시뮬레이션 전용. "신청을 도와드릴까요?"로 마무리
4. **CS 인계 트리거** — `is_stopped=true`, `status_text="실패주문건"`, `db_error`, 채널 밖 접촉 요구 시 자동 인계

---

## 남은 격차 (초안↔골든 비교 기준)

| 기준 | 골든 | 현재 초안 상태 |
|---|---|---|
| WMS 데이터 포함 | 실값 명시 | ✅ API 연동 완료 |
| 날짜·상태 추측 | 추측 없음 | ✅ 제약 조건 적용 |
| 채널 밖 접촉 금지 | 없음 | ✅ RISK-CHECKER 적용 |
| 출력 템플릿 고정 | 섹션 순서 고정 | ⚠️ 4주차 과제 |
| 톤 일관성 | "ATTRANGS 입니다~♡" | ⚠️ TONE-REVIEWER 적용 중, 검증 필요 |

---

## 4주차 할 일 (다음 세션)

- [ ] **출력 템플릿 고정** — `prompts/output-template.md` 섹션 순서·형식 확정 후 프롬프트에 hard-wire
- [ ] **골든 데이터 추가** — 현재 10건 → 15~20건 (엣지 케이스 포함)
- [ ] **TONE-REVIEWER 검증** — draft-8~14 기준 C1~C14 체크리스트 통과율 측정
- [ ] **spec.md D·G·H 작성** — 운영/관리자, 인프라/보안, 라이프사이클 섹션
- [ ] **서버 실행 확인** — `.env`에 `ANTHROPIC_API_KEY`, `WMS_API_KEY` 설정 후 `node src/server.js`

---

## 환경 설정

```bash
# 앱 서버 실행
cd C:\Users\yj-pl\ai-camp-week2
# .env 파일에 아래 두 값 필요:
# ANTHROPIC_API_KEY=sk-ant-...
# WMS_API_KEY=attrangs-cs-test-2026-may

node src/server.js        # 포트 3000

# 칸반보드 서버
cd cs자동화
npm start                 # 포트 8080 → http://localhost:8080
```

---

## 오늘(2026-05-30) 작업 내역

- 칸반보드 서버 실행 확인
- **서버 UTF-8 인코딩 버그 수정** (`server/kanban.cjs` — `parseBody` Buffer 처리, `writeTaskFileAtomic` 인코딩 명시)
- 기존 완료 작업 13개 칸반보드에 등록
