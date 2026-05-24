# 접근성·반응형·애니메이션 스펙

---

## 접근성 (A11y)

### 콘트라스트
- **WCAG AA** 기준 4.5:1 이상 (본문 텍스트)
- **AAA** 기준 7:1 (중요 경고 · 에러)
- 특히 amber 계열 배경에 흰 글씨 조합은 AA 위반 위험 — 반드시 체크

### 키보드 네비게이션
- 모든 상호작용 요소 `Tab`으로 접근 가능
- Focus indicator 필수: `ring-2 ring-zinc-900/10` 또는 동등한 표시
- Modal·Dialog는 focus trap (외부로 Tab 이탈 방지)
- ESC로 닫기 (dialog), 다른 플래그/컴포넌트로 이동: `↑↓` 또는 `j k`

### 단축키 규칙
- 단축키는 전역 안내 (Sidebar 하단 또는 도움말 페이지)
- 입력 필드 포커스 시 단축키 비활성 (typing 우선)
- 단축키 중복 금지: 예) `R`은 재생성 전용, 검색 `/`은 예약

### 스크린 리더
- 주요 상태 변경은 `aria-live` 영역으로 공지 (예: 토스트)
- 아이콘 전용 버튼은 `aria-label` 필수
- 플래그 수 뱃지: `aria-label="미해결 플래그 24건"`

### 언어
- `<html lang="ko">`
- 영문 혼용 요소: 부분적 `lang="en"` (예: 모델명)

---

## 반응형 (Responsive)

기본은 **데스크톱 1280 이상 기준**. 자동화 프로덕트는 대부분 워크스테이션 사용.

### 브레이크포인트 (권장)
- `sm`: 640px (모바일·태블릿 세로)
- `md`: 768px (태블릿 가로)
- `lg`: 1024px (랩톱)
- `xl`: 1280px (데스크톱 기본)
- `2xl`: 1536px (와이드)

### Screen별 대응
- **Control**: 1-column 모바일 지원 가능
- **Execution**: 1024 이상 권장 (Kanban 4-col)
- **Review**: 1280 이상 (3-pane). 1024 미만은 2-pane 또는 단일 스크롤로 fallback

### 모바일 (future)
- Review 모바일: nav tree → 축소된 dropdown, preview 전체화면, flag는 bottom sheet
- 모바일은 v2 로드맵으로 두고 1차 릴리스는 데스크톱 우선

---

## 애니메이션 타이밍

`tokens.json → motion.duration` 참조.

| 목적 | 지속 시간 | easing |
|---|---|---|
| hover 색 변화 | 150ms | default |
| 토스트 fade in/out | 250ms | out |
| 탭 전환 | 400ms | default |
| 앵커 pulse | 2000ms (0.6s × 3) | default |
| 드래그 인디케이터 | 150ms | default |
| Accordion 펼침 | 250ms | out |

### 규칙
- **모션은 조심스럽게**: 업무용 툴에서 과한 애니메이션은 피로 유발
- **사용자 설정 존중**: `@media (prefers-reduced-motion: reduce)` 감지 시 모든 애니메이션 비활성
- **스크롤은 smooth**: `behavior: 'smooth'` 기본. 단, `prefers-reduced-motion` 시 instant

---

## 성능 예산

- 초기 로드: 2초 이내 (lazy-load 제외)
- 탭 전환: 즉시 (JS 전환, 페이지 로드 없음)
- API 호출: 15초 timeout (LLM 호출은 50초까지 허용)
- 렌더 프레임: 60fps 유지 (복잡한 테이블 리렌더 시 주의)

---

## 브라우저 지원

- Chrome / Edge / Safari 최근 2 버전
- Firefox 최신
- 레거시 브라우저 (IE11 등) 미지원 — ES2020 JS 그대로 사용

---

## 프린트

- 기본 미지원 (복잡한 layout)
- xlsx/docx export가 프린트 용도 대체

---

## 관련 원칙

→ [`principles.md`](../principles.md) §7 한글 라벨 (=a11y와 연관)
