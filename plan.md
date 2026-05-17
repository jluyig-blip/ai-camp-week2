# plan.md — CS 자동응대 에이전트 (최종)

## 산출물 한 줄 정의
네이버 톡톡 · 카카오 상담톡으로 들어오는 고객 문의를
AI가 분류 → 데이터 조회 → 처리/답변 자동화하는 에이전트.
WMS·주문시스템은 API 명세를 입력받아 어댑터로 연결 (시스템 교체 시 명세만 교체).

---

## 시스템 구조

```
[채널 수신]
  네이버 톡톡 API          카카오 상담톡 API
       └─────────┬──────────────┘
                 ↓
         [채널 어댑터]
         메시지 정규화
         (채널 종류, 고객 ID, 본문, 접수 시각)
                 ↓
         [AI 분류 엔진]
         유형 분류 + 긴급도 + 신뢰도 점수
                 ↓
     ┌───────────┴───────────┐
     ↓                       ↓
[데이터 조회 레이어]    [신뢰도 < 임계값]
 WMS 어댑터                  ↓
 주문시스템 어댑터       팀원 알림 + 수동 처리
     ↓
[실행 레이어]
 Risk Tier 기준으로
 자동 실행 / 승인 대기 분기
     ↓
[채널 발신]
 톡톡 / 상담톡 자동 발송
```

---

## 기능 4개 · Risk Tier 정의

### Tier 1 — 자동 실행 (AI 단독)
오분류해도 복구 비용이 낮은 조회·안내성 작업.

| 기능 | AI 실행 내용 | 자동 발송 조건 |
|---|---|---|
| 배송 문의 | WMS 조회 → 배송상태 + 예상 도착일 안내 | 신뢰도 ≥ 0.85 |
| FAQ 안내 | 반품 정책·교환 조건·취소 기한 안내 | 신뢰도 ≥ 0.85 |
| 환불금액 시뮬레이션 | 주문 조회 → 쿠폰/할인 공제 후 금액 안내 | 신뢰도 ≥ 0.85 |

### Tier 2 — 팀원 1-click 승인 후 실행
시스템에 쓰기가 발생하는 작업. AI가 패키지를 만들고 사람이 승인.

| 기능 | AI 준비 내용 | 팀원 확인 항목 |
|---|---|---|
| 반품 접수 | 주문 조회 → 반품 가능 여부 판단 → 접수 패키지 생성 | 사유 적합성 · 기간 내 여부 |
| 교환 접수 | 주문 조회 + 재고 조회 → 가용재고 확인 → 접수 패키지 생성 | 재고 확보 · 교환 상품 확인 |

### Tier 3 — 팀장 직접 처리
AI는 분류 + 담당자 알림만. 처리 권한 없음.

- 악성 민원 · 반복 불만 고객
- 법적 분쟁 가능성 언급
- 정책 예외 요청 (쿠폰 중복 적용, 기간 초과 반품 등)
- AI 신뢰도 < 0.85 인 모든 케이스

---

## WMS 어댑터 — API 명세 입력 구조

WMS 시스템이 무엇이든 아래 4개 인터페이스만 구현하면 연동됨.
실제 WMS API 명세를 받으면 이 어댑터에 매핑.

```yaml
# wms-adapter-spec.yaml
# 실제 WMS API 명세를 받은 후 아래 필드를 채운다

wms:
  base_url: ""          # 예: https://wms.company.com/api/v1
  auth:
    type: ""            # bearer | api_key | basic
    header: ""          # Authorization 헤더 형식

  endpoints:
    # 1. 배송 상태 조회
    shipment_status:
      method: GET
      path: ""          # 예: /shipments/{order_id}
      response_map:
        tracking_number: ""   # 응답 JSON에서 송장번호 경로
        carrier: ""           # 택배사
        status: ""            # 현재 상태
        estimated_delivery: ""# 예상 도착일

    # 2. 재고 조회 (가용재고 = 재고 - 미배송)
    inventory:
      method: GET
      path: ""          # 예: /inventory/{product_id}
      response_map:
        total_stock: ""
        unshipped: ""
        available: ""   # 없으면 total_stock - unshipped 로 계산

order_system:
  base_url: ""
  auth:
    type: ""
    header: ""

  endpoints:
    # 3. 주문 조회
    order_detail:
      method: GET
      path: ""          # 예: /orders/{order_id}
      response_map:
        status: ""
        products: ""
        payment_method: ""
        coupon_used: ""
        discount_amount: ""
        order_date: ""

    # 4. 환불 시뮬레이션 (읽기 전용)
    refund_simulate:
      method: POST
      path: ""
      body_template: ""

    # 5. 반품 접수 (Tier 2 — 승인 후 호출)
    return_register:
      method: POST
      path: ""
      body_template: ""

    # 6. 교환 접수 (Tier 2 — 승인 후 호출)
    exchange_register:
      method: POST
      path: ""
      body_template: ""
```

---

## 채널 어댑터 — 톡톡 / 상담톡 API

```yaml
channels:
  naver_talktalk:
    webhook_receive: ""   # 수신 웹훅 URL (우리가 만들 엔드포인트)
    send_api: ""          # 발신 API URL
    auth_header: ""

  kakao_consultalk:
    webhook_receive: ""
    send_api: ""
    auth_header: ""

  message_schema:         # 정규화 후 공통 포맷
    channel: ""           # naver | kakao
    customer_id: ""
    message_body: ""
    received_at: ""
    order_id: ""          # 본문에서 파싱 (없으면 null)
```

---

## AI 처리 흐름 (상세)

```
1. 수신
   톡톡/상담톡 웹훅 → 채널 어댑터 → 정규화 메시지

2. 분류
   유형: 배송문의 | 반품 | 교환 | 환불 | FAQ | 기타
   긴급도: 높음(당일처리) | 보통 | 낮음
   신뢰도: 0.0 ~ 1.0

3. 분기
   신뢰도 < 0.85  → Tier 3 (팀원 알림)
   유형 = 배송/FAQ/환불시뮬  → Tier 1 (자동 실행)
   유형 = 반품/교환  → Tier 2 (패키지 생성 → 팀원 승인 대기)
   유형 = 기타/Tier3  → 팀원 알림

4. 데이터 조회 (Tier 1, 2 공통)
   WMS 어댑터 호출 (배송상태, 재고)
   주문시스템 어댑터 호출 (주문상세, 환불 시뮬레이션)

5. 실행
   Tier 1: 답변 초안 생성 → 채널 자동 발송
   Tier 2: 처리 패키지 생성 → 팀원 승인 인터페이스 전송 → 승인 시 API 호출 → 발송
   Tier 3: 팀원 알림 + 원문 + 분류 결과 전달

6. 로깅
   모든 처리 결과를 로그에 기록 (감사 추적용)
```

---

## AI가 맡는 일 vs 사람이 맡는 일

| 구분 | AI | 사람 |
|---|---|---|
| 조회 | 배송상태·재고·주문내역·환불 시뮬레이션 | — |
| 분류·판단 | 유형·긴급도·신뢰도 | 신뢰도 낮은 케이스 최종 판단 |
| 답변·발송 | Tier 1 자동 발송 | Tier 2 승인 · Tier 3 직접 작성 |
| 시스템 쓰기 | — | 반품·교환 API 승인 후 실행 |
| 예외·분쟁 | 감지 + 알림 | 직접 처리 |

---

## 오늘 자동화에서 제외할 것

- 환불 실처리 API 호출 (시뮬레이션까지만)
- Tier 3 케이스 자동 발송
- 정책 예외 자동 적용
- 고객 개인정보·결제정보 외부 전송
- WMS / 주문시스템 재고·주문 직접 수정
