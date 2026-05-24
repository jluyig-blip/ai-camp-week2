# 디자인 토큰 — 사용 가이드

[`tokens.json`](./tokens.json)의 설명판.

---

## 왜 토큰으로 분리했나

자동화 프로덕트 하나를 만들면 끝나지 않는다. 같은 팀에서 6개월 뒤 "마케팅 카피 자동화 v2"를 만들 때 버튼 색·플래그 색·글씨 크기를 **다시 정하지 않아도 되도록** 토큰 하나로 추출.

- 코드: CSS `var(--color-status-passed-bg)` 또는 Tailwind config extend
- Figma: Variables로 임포트 (Plugin 경로 참조)

---

## 핵심 토큰 그룹

### `color.status` — 작업 상태
자동화 프로덕트에서 항상 나타나는 5가지 상태. 색상을 일관되게 쓰면 학습 비용이 낮아진다.

| 상태 | 언제 | 색 톤 |
|---|---|---|
| idle | 아직 시작 안 됨 | zinc (회색) |
| generating | 생성 중 | blue |
| validating | 검증 중 | amber |
| passed | 통과 | emerald |
| flagged | 플래그 (사람 확인 필요) | rose |
| regenerating | 재생성 중 | amber (pulse) |
| error | 오류 | red |

### `color.flag` — 플래그 카테고리 5종
사람 검토가 필요한 이슈를 카테고리별로 구분. **각 카테고리는 고유 색**을 갖고 바뀌지 않는다.

| 카테고리 | 의미 | 색 |
|---|---|---|
| fact | 출처·사실 확인 필요 | rose |
| schema | 서식 규격 위반 | amber |
| borderline | 애매함 — 사람 판단 | indigo |
| sensitive | 민감 표현 가능 | pink |
| consistency | 앞뒤 불일치 | emerald |

> 프로젝트에 플래그 종류를 추가할 때는 **이 5개와 색이 겹치지 않는 것**으로 선택.

### `color.anchor` — 사람 검토 앵커
플래그를 클릭해 "여기 보세요" 표시할 때 쓰는 고유 색. amber 계열로 **플래그 카테고리와 분리**해서 혼동 방지.

### `color.toast` / `color.severity`
토스트 알림과 심각도(상/중/하)에 쓰는 별도 스케일.

---

## `typography`

- **fontFamily.sans = Pretendard Variable**: 한글이 주 언어인 프로덕트에서 최적. 로드 방법:
  ```html
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css" />
  ```
- **letterSpacing.korean = -0.01em**: 한글은 살짝 좁혀야 자연스럽다.
- **size 스케일 8단계**: 10 → 24px. 10/11은 보조 레이블, 12~14가 본문, 16~20은 섹션 타이틀, 24는 페이지 제목.

---

## `spacing` / `radius` / `shadow`

- **spacing은 4px 배수** (Tailwind 기본과 일치). 16px 카드 padding을 기준으로.
- **radius.lg 8px**이 기본 카드·인풋. **full**은 badge/pill 전용.
- **shadow는 3단계**만 사용. 자동화 프로덕트는 정보 밀도가 높으므로 그림자 난발 금지.

---

## `motion`

- **fast 150ms**: hover 색 변화
- **normal 250ms**: 패널 펼침/접힘, 토스트
- **slow 400ms**: 탭 전환, 스크롤
- **pulse 2000ms**: 앵커 하이라이트 (주의 끌기)

---

## `layout`

- **sidebar_width_default 240**: nav + run history에 충분
- **topbar_height 56**: breadcrumb + action pill이 여유있게
- **pane_divider_width 4**: 드래그 핸들 너비
- **content_max_width 1280**: 과도하게 넓으면 한 줄이 너무 길어 시선 피로
- **preview_max_width 768**: 본문 프리뷰는 더 좁게 (읽기 편하게)

---

## 실제 사용 예시

### CSS 변수로 (프레임워크 없이)
```css
:root {
  --c-status-passed-bg: #d1fae5;
  --c-status-passed-fg: #065f46;
  --c-flag-borderline-bg: #e0e7ff;
  --c-flag-borderline-fg: #3730a3;
  --radius-md: 6px;
  --font-sans: 'Pretendard Variable', -apple-system, sans-serif;
}

.badge-passed { background: var(--c-status-passed-bg); color: var(--c-status-passed-fg); }
```

### Tailwind config (React/Vue 프로젝트)
```js
// tailwind.config.js
const tokens = require('./design-library/00-foundation/tokens.json');
module.exports = {
  theme: {
    extend: {
      colors: {
        status: tokens.color.status,
        flag:   tokens.color.flag,
      },
      fontFamily: {
        sans: tokens.typography.fontFamily.sans.split(', '),
      },
      borderRadius: tokens.radius,
    },
  },
};
```

### JS (런타임에 토큰 접근)
```js
import tokens from '@/design-library/00-foundation/tokens.json';
const color = tokens.color.flag.fact.bg;
```

---

## 확장 규칙

새 프로젝트에서 토큰을 추가할 때:
1. **공통 자산에 들어가야 하는가?** → 다음 프로젝트에도 쓸 가능성이 있으면 이 파일에 추가
2. **이 프로젝트에만 쓴다** → `instances/{project}/tokens-extra.json`에 따로 저장
3. 기존 토큰의 값을 바꾸는 경우 → 반드시 버전 bump + 변경 이력 기록
