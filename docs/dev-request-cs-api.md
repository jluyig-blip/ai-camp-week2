# 개발팀 API 요청서 — CS 자동응답 연동

> 작성: 2026-05-31 | 담당: 정기열 (CS 운영팀)  
> 목적: CS AI 자동응답 시스템이 WMS와 완전 연동되어 미답변 문의를 자동 처리하기 위함

---

## 배경

현재 WMS에 아래 4개 API가 이미 구현되어 있습니다:
- `stock.php` — 재고 조회
- `order_status.php` — 주문 상태 조회  
- `return.php` — 반품 시뮬레이션
- `cancel.php` — 취소 시뮬레이션

이를 활용해 AI가 **주문 데이터를 조회 → 답변 초안 자동 생성**하는 기능은 완성됐습니다.

**남은 과제**: AI가 생성한 답변을 WMS로 전송하고, WMS에서 미답변 문의를 직접 가져오는 API 2개가 필요합니다.

---

## 요청 API 1 — 미답변 문의 목록 조회

### `POST /api/cs/qna_list.php`

**용도**: 모든 채널(자사몰·스마트스토어·네이버톡톡·카카오상담톡·지그재그·에이블리)의 미답변 문의를 가져옵니다.

**요청 파라미터**

| 파라미터 | 필수 | 설명 | 예시 |
|---|---|---|---|
| `status` | X | `unanswered`(미답변, 기본값) / `all` / `answered` | `unanswered` |
| `channel` | X | 채널 필터. 생략 시 전체 | `지그재그` |
| `limit` | X | 한 번에 가져올 건수 (기본 50, 최대 200) | `100` |
| `offset` | X | 페이징 오프셋 | `0` |
| `date_from` | X | 시작일 `YYYY-MM-DD` | `2026-05-24` |
| `date_to` | X | 종료일 `YYYY-MM-DD` | `2026-05-31` |

**응답 예시**

```json
{
  "ok": true,
  "total": 342,
  "items": [
    {
      "qna_idx": 1877862,
      "channel": "자사몰",
      "market_idx": "71957649",
      "subject": "반품비 문의",
      "content": "반품 신청했는데 반품비가 얼마인가요?",
      "customer_name": "강송희",
      "created_at": "2026-05-30 10:23:00",
      "status": "unanswered",
      "is_urgent": false
    },
    {
      "qna_idx": 1877838,
      "channel": "지그재그",
      "market_idx": "72003635",
      "subject": "배송 언제 오나요",
      "content": "주문한지 3일 됐는데 아직 배송이 안 왔어요",
      "customer_name": "이민지",
      "created_at": "2026-05-30 09:15:00",
      "status": "unanswered",
      "is_urgent": true
    }
  ]
}
```

**응답 필드 설명**

| 필드 | 설명 |
|---|---|
| `qna_idx` | 문의 고유 번호 (답변 전송 시 사용) |
| `channel` | 채널명: `자사몰` / `스마트스토어` / `네이버 톡톡` / `카카오 상담톡` / `지그재그` / `에이블리` |
| `market_idx` | 주문번호 (없으면 빈 문자열) |
| `subject` | 문의 제목 |
| `content` | 문의 본문 |
| `customer_name` | 고객 성함 |
| `created_at` | 접수 일시 |
| `status` | `unanswered` / `answered` |
| `is_urgent` | 긴급 여부 |

---

## 요청 API 2 — AI 답변 전송

### `POST /api/cs/qna_reply.php`

**용도**: AI가 생성한 답변을 WMS에 등록합니다. 담당자 검수 후 발송 또는 자동 발송 모두 지원합니다.

**요청 파라미터**

| 파라미터 | 필수 | 설명 | 예시 |
|---|---|---|---|
| `qna_idx` | **O** | 답변할 문의 번호 | `1877862` |
| `reply` | **O** | 답변 본문 | `안녕하세요, ATTRANGS 입니다~♡ ...` |
| `auto_send` | X | `0`=저장만(기본), `1`=즉시 발송 | `0` |
| `ai_generated` | X | AI 생성 여부 표시 `1`/`0` (감사 추적용) | `1` |
| `model_id` | X | 사용된 AI 모델명 (로그용) | `claude-sonnet-4-6` |

**응답 예시 — 성공**

```json
{
  "ok": true,
  "qna_idx": 1877862,
  "status": "saved",
  "sent_at": null
}
```

**응답 예시 — 즉시 발송 성공**

```json
{
  "ok": true,
  "qna_idx": 1877862,
  "status": "sent",
  "sent_at": "2026-05-31 10:45:00"
}
```

**응답 예시 — 이미 답변됨**

```json
{
  "ok": false,
  "code": "already_answered",
  "msg": "이미 답변이 등록된 문의입니다"
}
```

---

## 공통 사항 (기존 API와 동일)

```
Base URL: https://attrangs.co.kr/api/cs/
인증: X-API-Key 헤더 (기존 키 그대로 사용)
메서드: POST만 허용
Content-Type: application/x-www-form-urlencoded
```

---

## 자동화 플로우 (완성 시)

```
[WMS] qna_list.php
  ↓ 미답변 문의 목록 (전 채널)
[AI 서버] 각 문의별
  ↓ order_status.php / stock.php 로 WMS 데이터 조회
  ↓ Claude AI 답변 초안 생성
  ↓ 담당자 검수 (허브 대시보드)
[WMS] qna_reply.php
  ↓ 검수된 답변 전송
[고객] 채널별 답변 수신
```

---

## 우선순위

| 순서 | API | 이유 |
|---|---|---|
| **1순위** | `qna_list.php` | 없으면 미답변 문의를 자동으로 가져올 수 없음 |
| **2순위** | `qna_reply.php` | 없으면 AI 답변을 수동 복붙해야 함 |

---

## 테스트 환경

- AI 서버: `http://localhost:3001` (로컬 개발)
- WMS Base: `https://attrangs.co.kr/api/cs/`
- API Key: `attrangs-cs-test-2026-may`

구현 완료 후 `WMS_QNA_URL` 환경변수에 URL 설정하면 즉시 연동됩니다.
```bash
WMS_QNA_URL=https://attrangs.co.kr/api/cs/qna_list.php
WMS_QNA_REPLY_URL=https://attrangs.co.kr/api/cs/qna_reply.php
```
