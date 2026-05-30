# Unified CS AI Hub — Design Spec

> 작성: 2026-05-30 | 승인: 정기열님

## 개요

`localhost:3001/hub` 신규 라우트에 Unified CS AI 대시보드를 구현한다.
참고 이미지의 3패널 구조를 그대로 따르며, 문의 선택 시 WMS API를 실시간 호출해 AI 답변 초안을 자동 생성한다.
실시간 테스트 페이지는 별도 존재하지 않고 이 허브 자체가 실전 테스트 환경이다.

---

## 아키텍처

```
브라우저 (localhost:3001/hub)
  ↓ 문의 선택
Express 서버 (src/server.js)
  ↓ POST /api/draft
  ├─ WMS API 호출 (order_status / stock / return / cancel)
  └─ Claude API (tool use 루프) → 답변 초안 반환
```

---

## 레이아웃 — 3패널 + 상단바

### 상단 KPI 바 (4개)
- 오늘 문의 수 (전일 대비 %)
- 평균 응답 시간 (전일 대비 %)
- 승인 대기 수 (긴급 N건)
- 자동화율 — 초안 생성 성공률

### 채널 필터 바
자사몰 · 네이버 톡톡 · 카카오 상담톡 · 지그재그 · 에이블리 (클릭 필터)

### 좌 패널 — 통합 문의함 (220px)
- 검색 input (전체 필드)
- 문의 목록: 긴급도 배지 · 제목 · 채널 · 시간
- 긴급도: 긴급(빨강) / 높음(주황) / 보통(파랑)
- 클릭 시 중앙 패널 로드

### 중앙 패널 — 문의 상세 + AI 초안
1. 헤더: 긴급도 · 제목 · 고객 메타 · 다시 생성 버튼
2. 고객 메시지 원문
3. WMS 조회 결과 섹션 (API 실시간)
4. AI 답변 초안 박스 (claude-sonnet-4-6, streaming)
5. 액션 바: 검수 후 승인 · 수정 · 보류 · 자동 발송 아님

### 우 패널 — WMS 상세 (260px)
- 연동 상태 표시 (실시간 pulse)
- 탭: 주문 정보 · 재고 정보 · 배송 정보 · 반품/교환
- 자동화 플로우 상태 (수신→초안→승인→발송)

### 좌 사이드바 (180px)
- 브랜드: Unified CS AI
- 네비: 대시보드 · 통합 문의함 · 승인 대기 · 자동화 규칙 · WMS 연동 · 채널 설정 · 리포트
- 하단: 오늘 요약 미니 차트

---

## API 설계

### 기존 (src/server.js 활용)
- `GET /` → index.html (기존 유지)
- `POST /api/draft` → WMS 조회 + Claude 초안 생성 (기존 로직 재사용)

### 신규 추가
- `GET /hub` → hub.html 서빙
- `GET /api/inquiries` → 골든 데이터 + 더미 문의 목록 반환 (JSON)
- `GET /api/stats` → KPI 통계 반환 (더미 or 실제 집계)

---

## 데이터

- 문의 목록: `golden/input-example.md` 10건 파싱 + 더미 추가 (총 ~20건)
- WMS 조회: 실제 API (`order_status.php`, `stock.php`, `return.php`, `cancel.php`)
- AI 초안: 기존 `POST /api/draft` 엔드포인트 재사용
- KPI: 서버 메모리 카운터 (세션 기반, 새로고침 시 초기화)

---

## 디자인 토큰

- 배경: `#0a0f1e` (다크 네이비)
- 사이드바: `#0f172a`
- 카드: `#1e293b`
- 액센트: `#f43f5e` (로즈 핑크)
- 정보: `#38bdf8` (스카이 블루)
- 성공: `#22c55e`
- 경고: `#f59e0b`
- 폰트: Pretendard (fallback: Apple SD Gothic Neo)

---

## 구현 범위 (이번 스프린트)

- [x] `GET /hub` 라우트 + `hub.html` 정적 파일
- [x] 문의 목록 API + 렌더링
- [x] 문의 클릭 → WMS 조회 → AI 초안 생성 플로우
- [x] 4개 KPI 카드 (더미 통계)
- [x] 채널 필터 (클라이언트 필터링)
- [x] WMS 우 패널 탭 전환

## 범위 외 (추후)
- 실제 발송 연동
- 로그인/인증
- 실시간 문의 수신 (웹소켓)
- 리포트 페이지
