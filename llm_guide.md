# 아뜨랑스 CS API — LLM 통합 가이드

이 문서는 제미나이/클로드 등의 LLM 이 CS 자동 응대를 할 때 4개 API 를 어떻게 호출하고, 응답을 어떻게 고객 답변으로 변환할지 정리한 가이드입니다.

---

## 공통 사항

**Base URL**
```
https://attrangs.co.kr/api/cs/
```

**요청 방식**
- 메서드: **POST 만 허용** (GET 은 URL/로그/Referer 에 키·파라미터가 박혀 거부됨, 405 반환)
- Content-Type: `application/x-www-form-urlencoded` 또는 `application/json`

**인증 (테스트 단계)**
- 헤더: `X-API-Key: attrangs-cs-test-2026-may`
- 쿼리스트링/바디로 키 전달 불가 — 반드시 헤더로만

**응답 공통 구조**
```json
{ "ok": true,  "...": "..." }    // 성공
{ "ok": false, "code": "...", "msg": "..." }  // 실패
```

| `code` 값 | 의미 | HTTP |
|---|---|---:|
| `missing_param` | 필수 파라미터 누락 | 400 |
| `invalid_param` | 입력 형식 오류 | 400 |
| `unauthorized` | API 키 불일치 | 401 |
| `not_found` | 데이터 없음 | 404 |
| `method_not_allowed` | GET 등 POST 외 메서드 | 405 |
| `db_error` | DB 오류 (운영 이슈) | 500 |

---

## 1) 가용재고 조회 — `stock.php`

**용도**: 고객이 "이 상품 재고 있나요?" 라고 물을 때

**호출**
```bash
POST /api/cs/stock.php
X-API-Key: attrangs-cs-test-2026-may
Content-Type: application/x-www-form-urlencoded

code=AT12345
code=AT12345&op1=S&op2=BLACK
goods_idx=170289
goods_idx=170289&op1_idx=698539&op2_idx=698541
```

**파라미터**
| 이름 | 필수 | 설명 |
|---|---|---|
| `code` | △ | 상품코드 (`code` 또는 `goods_idx` 중 하나) |
| `goods_idx` | △ | 상품 정수 PK |
| `op1` / `op2` | X | 옵션명 (예: "S", "BLACK") |
| `op1_idx` / `op2_idx` | X | 옵션 정수 PK |

**응답 필드 해석**
| 필드 | 의미 | 고객 답변 시 활용 |
|---|---|---|
| `items[]` | 옵션 조합별 재고 행 | 옵션별로 따로 안내 |
| `code` / `goods_idx` | 상품 식별 | 답변에 직접 노출 안 함 |
| `goods_name` | 상품명 | 그대로 사용 |
| `op1` / `op2` | 옵션명 (사이즈/색상) | "S 사이즈 블랙" 등으로 조합 |
| **`available`** | **가용 재고 (재고 - 미발송)** | **이 숫자가 고객 안내 핵심** |
| `stock` | 창고 재고 | 참고용 |
| `unshipped` | 미발송 수량 | "현재 OO건 발송 대기" 안내 시 |
| `restock_date` | 입고 예정일 (`""` 면 미정) | 품절 시 "OO일 입고 예정" 안내 |

**판단 룰**
- `available >= 1` → "주문 가능합니다"
- `available <= 0` AND `restock_date` 있음 → "현재 품절, OOOO-MM-DD 입고 예정"
- `available <= 0` AND `restock_date` 없음 또는 빈값 → "현재 품절, 입고일 미정"
- `not_found` 배열이 비어있지 않으면 "해당 상품코드를 찾을 수 없음"

**답변 예시**
> "엔네르 워셔블 가디건 Pink S 사이즈는 현재 23개 주문 가능합니다."
> "Ivory M 사이즈는 품절 상태이며 입고 예정일은 아직 정해지지 않았습니다."

---

## 2) 주문 상태 조회 — `order_status.php`

**용도**: 고객이 "내 주문 어디까지 갔어요?" 라고 물을 때

**호출**
```bash
POST /api/cs/order_status.php
X-API-Key: attrangs-cs-test-2026-may
Content-Type: application/x-www-form-urlencoded

market_idx=71980120
market_idx=71980120-71980121   # 합포건
```

**파라미터**
| 이름 | 필수 | 설명 |
|---|---|---|
| `market_idx` | O | 주문번호 (합포 시 `-` 구분) |

**응답 필드 해석**
| 필드 | 의미 |
|---|---|
| **`status_text`** | **주문 상태 (한글)** — 답변 핵심 |
| `status_code` | 상태 코드 (1~7) — 참고용 |
| `is_stopped` | `true` 면 배송 중지 |
| `is_combined` | 합포 여부 |
| `combined_orders[]` | 합포된 원주문번호들 |
| `allocated` | 전체 할당 완료 여부 |
| `tracking_no` | 운송장 번호 (없으면 `""`) |
| `expected_ship_date` | 출고 예정일 |
| `items[].item_status` | 라인별 상태 (한글) |
| `items[].delayed` | 입고 지연 여부 |
| `items[].delay_until` | 입고 예정일 (지연인 경우) |

**`status_text` 가능 값**
| 값 | 고객 안내 멘트 |
|---|---|
| 입금대기중 | "입금 확인 대기 중입니다" |
| 결제완료 | "결제가 완료되었고 출고 준비 중입니다" |
| 출고시작 | "출고가 시작되었습니다" |
| 부분배송 | "일부 상품이 먼저 발송되었습니다" |
| 배송중 | "배송 중입니다" |
| 거래완료 | "배송이 완료되었습니다" |
| 전체취소 | "주문이 취소된 상태입니다" |
| 배송중지 | "배송 중지된 주문입니다 (CS 확인 필요)" |
| 실패주문건 | "주문 정보 확인 필요 (CS 문의)" |

**`item_status` 가능 값**
- `발송완료` — 운송장 부여 + 실제 출고됨 (`gonumber != ''`). 발송 시 `shop_basket_give` 가 정리되므로 `gea=0` 으로 보일 수 있음
- `할당완료` / `부분할당` / `할당대기` (출고 전 단계)
- `취소` / `수거중` / `수거완료` (취소·반품 상태)
- `부분배송` (pdan=4)

**판단 룰**
- `items[].delayed=true` 인 라인이 있으면 "OO 상품은 OOOO-MM-DD 입고 예정으로 지연 중" 안내
- `delay_until` 이 오늘 이전이면 "예정 입고일이 지났는데 아직 미입고" — CS 확인 필요
- `tracking_no` 가 채워졌으면 안내, 비었으면 "아직 운송장 발급 전"

**답변 예시**
> "주문번호 71980120 은 현재 결제완료 상태이며 출고 준비 중입니다. 다만 5개 상품 중 3개가 입고 지연 상태로 함께 발송될 예정입니다."

---

## 3) 반품 시뮬레이션 — `return.php` (조회 전용)

**용도**: 고객이 "반품하면 얼마 환불받아요?" 라고 물을 때 — **실제 접수는 X**

**호출**
```bash
POST /api/cs/return.php
Content-Type: application/x-www-form-urlencoded

market_idx=71980120&reason=단순변심
```

**파라미터**
| 이름 | 필수 | 설명 |
|---|---|---|
| `market_idx` | O | 주문번호 |
| `reason` | O | `단순변심` / `상품불량` / `오배송` 중 하나 |
| `basket_idx_list[]` | X | 부분 반품 시 라인 idx 배열 (생략 = 전 품목) |

**응답 필드 해석**
| 필드 | 의미 |
|---|---|
| **`available`** | **반품 가능 여부** |
| `reason_if_not` | 불가 사유 (가능 시 null) |
| `expected_pickup_date` | 수거 예정일 (영업일+2) |
| `vip_free_return` | VIP 무료반품 적용 여부 |
| `refund.product_amount` | 상품금액 합계 |
| `refund.shipping_deduction` | 차감되는 배송비 |
| `refund.point_refund` | 환불될 적립금/예치금 |
| `refund.account_refund` | 현금 환불액 |
| **`refund.total`** | **총 환불 예정금액** |
| `note` | 항상 "시뮬레이션…" 안내문 |

**판단 룰**
- `available=true` → "반품 가능, 환불 예정 OOO원, 수거 예정 OOOO-MM-DD" 안내
- `available=false` → `reason_if_not` 그대로 안내
- 배송완료(dan=6) 또는 배송중(dan=5) 상태에서만 가능
- `단순변심` 은 왕복배송비 차감, `상품불량`/`오배송` 은 면제
- `vip_free_return=true` 면 "VIP 무료반품 적용" 추가 안내

**중요**: 이 API 는 **시뮬레이션** 입니다. 실제 반품 접수는 별도 — 고객에게는 "신청을 도와드릴까요?" 라고 묻고 실 처리는 CS 담당자/별도 시스템이 진행.

**답변 예시**
> "반품 가능합니다. 단순변심이라 왕복배송비 6,000원이 차감되어 총 85,900원이 환불될 예정입니다. 수거 예정일은 2026-05-25 입니다. 신청을 진행할까요?"

---

## 4) 주문 취소 시뮬레이션 — `cancel.php` (조회 전용)

**용도**: 고객이 "취소할 수 있어요?" 라고 물을 때 — **실제 취소는 X**

**호출**
```bash
POST /api/cs/cancel.php
Content-Type: application/x-www-form-urlencoded

market_idx=71980120&reason=단순변심
```

**파라미터**
| 이름 | 필수 | 설명 |
|---|---|---|
| `market_idx` | O | 주문번호 |
| `reason` | O | 취소 사유 (자유 문자열) |
| `basket_idx_list[]` | X | 부분 취소 시 라인 idx 배열 |

**응답 필드 해석**
| 필드 | 의미 |
|---|---|
| **`full_cancellable`** | **전체 취소 가능 여부** |
| `reason_if_not` | 전체 취소 불가 시 사유 |
| `refund.total` | 총 환불 예정금액 |
| `refund_method` | 환불 수단 (한글) |
| `refund_method_code` | 환불 수단 코드 (참고) |
| **`items_to_cancel[]`** | **라인별 취소 가능 여부** |
| `items_to_cancel[].cancellable` | 그 라인 취소 가능 여부 |
| `items_to_cancel[].requires_tracking_removal` | 송장 삭제가 선행되어야 하는지 |
| `items_to_cancel[].reason_if_not` | 라인 불가 사유 |

**판단 룰**
- `full_cancellable=true` → "전체 취소 가능, 환불 예정 OOO원 (수단: OOO)"
- `full_cancellable=false` 인데 `items_to_cancel[]` 에 `cancellable=true` 가 있으면 → "전체 취소는 안 되지만 일부 품목은 취소 가능"
- 어느 라인이든 `requires_tracking_removal=true` 면 "운송장이 발급됐으나 실출고 전 — 송장 삭제 후 처리" 안내
- 전부 불가면 사유 그대로 전달

**`refund_method` 가능 값**
- WPAY / 무통장입금 / 신용카드 / 실시간계좌이체 / 가상계좌 / 휴대폰결제 / 티머니결제 / 외부몰 / 캐시비 / 카카오페이 / 페이코 / 해피머니 / 컬쳐랜드 / 삼성페이 / 스마일페이 / 카카오페이(INI) / 페이팔

**답변 예시**
> "주문 71980120 은 전체 취소 가능합니다. 환불 예정금액은 91,900원이고 삼성페이로 환불됩니다."
> "주문 71980150 은 일부 상품(2건)이 이미 출고되어 전체 취소는 불가합니다. 나머지 3건만 취소하시려면 알려주세요."

---

## 전체 흐름 (LLM 시나리오)

```
[고객 문의]
    ↓
[LLM 의도 파악]
    ↓
재고? → stock.php
주문 상태? → order_status.php
반품? → return.php (시뮬레이션)
취소? → cancel.php (시뮬레이션)
    ↓
[응답 파싱 + 위 가이드대로 한글 답변 생성]
    ↓
[고객에게 답변]
    ↓
(반품/취소 동의 시) → CS 담당자 또는 별도 처리 API 호출
```

---

## LLM Tool / Function 정의 예시

### Claude / OpenAI 형식

```json
[
  {
    "name": "get_stock",
    "description": "아뜨랑스 상품의 가용재고를 조회합니다",
    "parameters": {
      "type": "object",
      "properties": {
        "code": {"type": "string", "description": "상품코드 (콤마 구분으로 복수 조회 가능)"},
        "op1":  {"type": "string", "description": "옵션1 (사이즈 등) 필터"},
        "op2":  {"type": "string", "description": "옵션2 (색상 등) 필터"}
      },
      "required": ["code"]
    }
  },
  {
    "name": "get_order_status",
    "description": "주문 상태/할당/택배/품목 정보를 조회합니다",
    "parameters": {
      "type": "object",
      "properties": {
        "market_idx": {"type": "string", "description": "주문번호. 합포 시 '-' 로 묶음"}
      },
      "required": ["market_idx"]
    }
  },
  {
    "name": "simulate_return",
    "description": "반품 가능 여부와 예상 환불금액을 시뮬레이션합니다 (실제 접수 안 함)",
    "parameters": {
      "type": "object",
      "properties": {
        "market_idx": {"type": "string"},
        "reason": {"type": "string", "enum": ["단순변심", "상품불량", "오배송"]},
        "basket_idx_list": {"type": "array", "items": {"type": "integer"}, "description": "부분 반품 시 라인 idx"}
      },
      "required": ["market_idx", "reason"]
    }
  },
  {
    "name": "simulate_cancel",
    "description": "주문 취소 가능 여부와 환불금액을 시뮬레이션합니다 (실제 취소 안 함)",
    "parameters": {
      "type": "object",
      "properties": {
        "market_idx": {"type": "string"},
        "reason": {"type": "string"},
        "basket_idx_list": {"type": "array", "items": {"type": "integer"}}
      },
      "required": ["market_idx", "reason"]
    }
  }
]
```

---

## 시스템 프롬프트 권장 문구 (LLM 에 박아둘 가이드)

```
당신은 아뜨랑스 쇼핑몰의 CS 담당입니다. 고객 문의가 들어오면:

1. 의도가 명확하지 않으면 먼저 추가 정보를 묻습니다
   (상품코드, 주문번호, 사유 등)

2. 다음 도구를 활용하여 정확한 정보를 조회한 후 답변합니다:
   - 재고 문의: get_stock
   - 주문 상태 문의: get_order_status
   - 반품 문의: simulate_return (시뮬레이션만, 실제 접수 X)
   - 취소 문의: simulate_cancel (시뮬레이션만, 실제 취소 X)

3. 응답 규칙:
   - 응답의 코드값(buymethod 의 'S' 등)이 아닌 한글값(refund_method 의 '삼성페이')을 그대로 사용
   - 금액은 항상 "OOO원" 형식, 천 단위 콤마 포함
   - 날짜는 "YYYY-MM-DD" 또는 "MM월 DD일" 형식
   - "시뮬레이션 결과" 라는 문구는 고객에게 노출하지 말 것
   - 반품/취소 시뮬레이션 후엔 항상 "신청을 도와드릴까요?" 로 마무리
   - delay_until 이 오늘 이전이면 "예정일이 지났으니 정확한 입고일은 확인 후 안내드리겠습니다" 라고 안내

4. 다음 경우엔 CS 담당자에게 인계:
   - is_stopped=true (배송중지)
   - status_text="실패주문건"
   - db_error 등 시스템 오류
   - 결제 정정/부분환불 같은 복잡한 케이스
```
