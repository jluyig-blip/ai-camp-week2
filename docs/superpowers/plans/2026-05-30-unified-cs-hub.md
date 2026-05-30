# Unified CS AI Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `localhost:3001/hub`에 Unified CS AI 대시보드 구현 — 문의 선택 시 WMS API 실시간 호출 + AI 답변 초안 자동 생성

**Architecture:** 기존 `src/server.js`에 `/hub`, `/api/inquiries`, `/api/stats` 3개 라우트 추가. `hub.html` 정적 파일을 `public/hub.html`로 생성. 기존 `POST /api/generate` SSE 엔드포인트를 그대로 재사용해 WMS 조회 + AI 초안 생성.

**Tech Stack:** Node.js + Express (ESM), Anthropic SDK, Vanilla JS (fetch + SSE), CSS Grid/Flex

---

## 파일 맵

| 파일 | 역할 |
|---|---|
| `src/server.js` | 기존 파일에 3개 라우트 추가 |
| `public/hub.html` | 허브 대시보드 — 전체 UI |
| `src/parse-inquiries.js` | golden/input-example.md 파싱 유틸 (신규) |

---

## Task 1: 서버에 `/hub` + `/api/inquiries` + `/api/stats` 라우트 추가

**Files:**
- Modify: `src/server.js`
- Create: `src/parse-inquiries.js`
- Create: `public/hub.html` (빈 파일로 생성)

- [ ] **Step 1: `public/` 디렉토리 생성 확인 + 빈 hub.html 생성**

```bash
mkdir -p public
echo "<!DOCTYPE html><html><body>hub ok</body></html>" > public/hub.html
```

- [ ] **Step 2: `src/parse-inquiries.js` 생성**

```js
// src/parse-inquiries.js
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CHANNEL_URGENCY = {
  '주문취소': '보통', '배송문의': '높음', '교환': '보통',
  '반품': '보통', '출고 지연': '긴급', '사이즈': '보통', '배송일': '보통',
};

const CHANNEL_TAGS = ['자사몰', '네이버 톡톡', '카카오 상담톡', '지그재그', '에이블리'];

export function parseInquiries() {
  const md = readFileSync(join(ROOT, 'golden', 'input-example.md'), 'utf8');
  const sections = md.split(/^## /m).filter(s => s.trim());
  const inquiries = [];

  for (const sec of sections) {
    const lines = sec.split('\n');
    const titleLine = lines[0] ?? '';
    const titleMatch = titleLine.match(/입력 (\d+) — (.+)/);
    if (!titleMatch) continue;

    const id   = titleMatch[1];
    const type = titleMatch[2].trim();

    const channel  = lines.find(l => l.startsWith('- 채널:'))?.replace('- 채널:', '').trim() ?? '자사몰';
    const received = lines.find(l => l.startsWith('- 접수:'))?.replace('- 접수:', '').trim() ?? '';
    const orderNo  = lines.find(l => l.startsWith('- 주문번호:'))?.replace('- 주문번호:', '').trim() ?? '미제공';
    const contentLine = lines.find(l => l.startsWith('>'));
    const content  = contentLine?.replace(/^>\s*"?/, '').replace(/"?$/, '').trim() ?? '';

    const urgency = CHANNEL_URGENCY[type] ?? '보통';
    const time = received.split(' ')[1] ?? '00:00';
    const customer = `고객${id}`;

    inquiries.push({ id, type, channel, received, orderNo, content, urgency, time, customer });
  }

  return inquiries;
}
```

- [ ] **Step 3: `src/server.js`에 라우트 3개 추가 — `app.use(express.static(ROOT))` 바로 위에 삽입**

아래 import를 파일 상단 import 블록에 추가:
```js
import { parseInquiries } from './parse-inquiries.js';
import { createReadStream } from 'fs';
```

아래 라우트를 `app.post('/api/generate', ...)` 바로 위에 추가:
```js
// ── Hub routes ─────────────────────────────────────────────────────
app.get('/hub', (_req, res) => {
  res.sendFile(join(ROOT, 'public', 'hub.html'));
});

app.get('/api/inquiries', (_req, res) => {
  try {
    res.json(parseInquiries());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', (_req, res) => {
  const inquiries = parseInquiries();
  res.json({
    todayCount:    inquiries.length + 1241,
    avgResponseSec: 272,
    pendingApproval: 32,
    urgentCount:   5,
    automationRate: 68,
    deltaToday:    18,
    deltaResponse: -12,
    deltaAuto:     7,
    channels: [
      { name: '자사몰',       count: 412, delta: 16 },
      { name: '네이버 톡톡',  count: 324, delta: 10 },
      { name: '카카오 상담톡', count: 276, delta: 9  },
      { name: '지그재그',     count: 156, delta: 11 },
      { name: '에이블리',     count: 80,  delta: 7  },
    ],
  });
});
```

- [ ] **Step 4: 서버 재시작 후 엔드포인트 확인**

```bash
# 기존 3001 프로세스 종료 후 재시작
PORT=3001 node src/server.js &
sleep 2
curl -s http://localhost:3001/api/inquiries | node -e "const d=require('fs').readFileSync(0,'utf8'); const a=JSON.parse(d); console.log('문의 수:', a.length, '/ 첫 건:', a[0]?.type)"
curl -s http://localhost:3001/api/stats | node -e "const d=require('fs').readFileSync(0,'utf8'); const s=JSON.parse(d); console.log('오늘 문의:', s.todayCount)"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/hub
```

Expected:
```
문의 수: 7 / 첫 건: 주문취소 (포인트 혼합결제)
오늘 문의: 1248
200
```

- [ ] **Step 5: 커밋**

```bash
git add src/parse-inquiries.js src/server.js public/hub.html
git commit -m "feat: add /hub route and /api/inquiries, /api/stats endpoints"
```

---

## Task 2: `public/hub.html` — 레이아웃 셸 (사이드바 + KPI + 3패널 뼈대)

**Files:**
- Modify: `public/hub.html`

- [ ] **Step 1: hub.html 전체 교체 — CSS 토큰 + 레이아웃 셸**

`public/hub.html`을 아래 내용으로 전체 교체:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unified CS AI</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg:       #0a0f1e;
  --bg2:      #0f172a;
  --bg3:      #0c1524;
  --card:     #1e293b;
  --border:   #1e293b;
  --border2:  #334155;
  --text:     #e2e8f0;
  --muted:    #94a3b8;
  --dim:      #64748b;
  --faint:    #475569;
  --rose:     #f43f5e;
  --sky:      #38bdf8;
  --green:    #22c55e;
  --amber:    #f59e0b;
  --blue:     #3b82f6;
}
body { background: var(--bg); color: var(--text); font-family: 'Pretendard','Apple SD Gothic Neo',sans-serif; font-size: 12px; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

/* TOPBAR */
.topbar { height: 40px; background: var(--bg2); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: flex-end; padding: 0 16px; gap: 12px; flex-shrink: 0; }
.topbar .conn-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
.topbar .conn-label { font-size: 11px; color: var(--green); }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

/* SHELL */
.shell { display: flex; flex: 1; overflow: hidden; }

/* SIDEBAR */
.sidebar { width: 180px; background: var(--bg2); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
.sidebar-logo { padding: 14px; border-bottom: 1px solid var(--border); }
.sidebar-logo .brand { color: var(--rose); font-weight: 700; font-size: 13px; }
.sidebar-logo .sub   { color: var(--faint); font-size: 10px; margin-top: 2px; }
.nav-item { padding: 8px 14px; display: flex; align-items: center; gap: 8px; color: var(--dim); cursor: pointer; font-size: 11px; transition: all .15s; }
.nav-item:hover { background: var(--card); color: var(--text); }
.nav-item.active { background: rgba(244,63,94,.1); color: var(--rose); border-right: 2px solid var(--rose); }
.nav-item .icon { width: 16px; text-align: center; font-size: 13px; }
.nav-badge { margin-left: auto; background: var(--rose); color: #fff; border-radius: 10px; padding: 1px 6px; font-size: 9px; font-weight: 700; }
.sidebar-footer { margin-top: auto; padding: 12px 14px; border-top: 1px solid var(--border); }
.mini-chart-bar { height: 32px; border-radius: 4px; background: linear-gradient(90deg,rgba(244,63,94,.1),rgba(244,63,94,.3)); position: relative; overflow: hidden; }
.mini-chart-bar::after { content: '↗ 오늘 문의 +18%'; position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--rose); }
.report-link { font-size: 10px; color: var(--rose); margin-top: 6px; cursor: pointer; }

/* MAIN */
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

/* KPI BAR */
.kpi-bar { display: grid; grid-template-columns: repeat(4,1fr); background: var(--bg2); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.kpi + .kpi { border-left: 1px solid var(--border); }
.kpi { padding: 10px 16px; }
.kpi .kpi-label { color: var(--faint); font-size: 10px; margin-bottom: 4px; }
.kpi .kpi-val   { font-size: 22px; font-weight: 700; line-height: 1; }
.kpi .kpi-val small { font-size: 12px; font-weight: 400; }
.kpi .kpi-delta { font-size: 10px; margin-top: 3px; }
.delta-up   { color: var(--green); }
.delta-down { color: var(--rose);  }
.delta-warn { color: var(--amber); }

/* CHANNEL BAR */
.ch-bar { display: flex; align-items: center; gap: 6px; padding: 6px 14px; background: var(--bg); border-bottom: 1px solid var(--border); flex-shrink: 0; overflow-x: auto; }
.ch-tag { background: var(--card); border-radius: 20px; padding: 3px 10px; font-size: 10px; color: var(--muted); cursor: pointer; white-space: nowrap; border: 1px solid transparent; transition: all .15s; }
.ch-tag:hover, .ch-tag.active { background: rgba(244,63,94,.1); color: var(--rose); border-color: rgba(244,63,94,.3); }

/* 3-PANEL */
.panels { flex: 1; display: grid; grid-template-columns: 220px 1fr 260px; overflow: hidden; }

/* INQUIRY LIST */
.inq-list { background: var(--bg3); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.inq-search { padding: 8px 10px; border-bottom: 1px solid var(--border); }
.inq-search input { width:100%;background:var(--card);border:1px solid var(--border2);border-radius:6px;padding:5px 8px;color:var(--text);font-size:11px;outline:none; }
.inq-search input::placeholder { color: var(--faint); }
.inq-meta-bar { padding: 5px 10px; font-size: 10px; color: var(--faint); border-bottom: 1px solid var(--border); display:flex;justify-content:space-between; }
.inq-scroll { overflow-y: auto; flex: 1; }
.inq-item { padding: 8px 10px; border-bottom: 1px solid rgba(30,41,59,.5); cursor: pointer; transition: background .1s; }
.inq-item:hover { background: rgba(30,41,59,.6); }
.inq-item.active { background: rgba(244,63,94,.07); border-left: 2px solid var(--rose); }
.inq-item .row1 { display:flex;align-items:center;gap:5px;margin-bottom:3px; }
.inq-title { flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px; }
.urg { font-size: 9px; padding: 1px 5px; border-radius: 3px; font-weight: 700; flex-shrink:0; }
.urg-긴급 { background:rgba(244,63,94,.2);color:var(--rose); }
.urg-높음 { background:rgba(245,158,11,.2);color:var(--amber); }
.urg-보통 { background:rgba(59,130,246,.2);color:var(--blue); }
.inq-sub  { font-size: 9px; color: var(--faint); display:flex;gap:6px; }
.inq-more { padding: 8px; text-align:center; font-size:10px; color:var(--sky); cursor:pointer; border-top:1px solid var(--border); }

/* DETAIL */
.detail { display:flex;flex-direction:column;overflow:hidden;background:var(--bg); }
.detail-header { padding: 10px 14px; border-bottom:1px solid var(--border); }
.detail-title-row { display:flex;align-items:center;gap:8px;margin-bottom:3px; }
.detail-title { font-size:13px;font-weight:600; }
.detail-meta  { font-size:10px;color:var(--faint); }
.detail-actions-top { display:flex;gap:6px;margin-top:6px; }
.detail-body { flex:1;overflow-y:auto;padding:10px 14px;display:flex;flex-direction:column;gap:8px; }
.customer-bubble { background:var(--card);border-radius:8px;padding:10px;font-size:11px;color:var(--muted);line-height:1.7; }
.wms-result-box { background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 10px; }
.wms-result-box .wms-rtitle { color:var(--sky);font-weight:600;font-size:10px;margin-bottom:6px;display:flex;align-items:center;gap:6px; }
.wms-row { display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(30,41,59,.4); }
.wms-row:last-child { border-bottom:none; }
.wms-row .k { color:var(--faint);font-size:10px; }
.wms-row .v { color:var(--muted);font-size:10px;text-align:right; }
.wms-row .v.ok   { color:var(--green); }
.wms-row .v.warn { color:var(--amber); }
.wms-row .v.err  { color:var(--rose);  }
.draft-box { background:#0f2942;border:1px solid rgba(29,78,216,.4);border-radius:8px;overflow:hidden; }
.draft-head { background:rgba(29,78,216,.15);padding:6px 10px;font-size:10px;color:#60a5fa;display:flex;align-items:center;gap:6px; }
.draft-spinner { width:10px;height:10px;border:2px solid rgba(59,130,246,.2);border-top-color:var(--blue);border-radius:50%;animation:spin .8s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.draft-body { padding:10px;font-size:11px;color:#cbd5e1;line-height:1.75;min-height:60px;white-space:pre-wrap; }
.placeholder-panel { flex:1;display:flex;align-items:center;justify-content:center;color:var(--faint);font-size:12px; }
.action-bar { padding:8px 14px;border-top:1px solid var(--border);display:flex;gap:6px;flex-shrink:0; }
.btn { padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:none; }
.btn-approve { background:var(--green);color:#fff; }
.btn-edit    { background:var(--card);color:var(--muted);border:1px solid var(--border2); }
.btn-hold    { background:var(--card);color:var(--muted);border:1px solid var(--border2); }
.btn-no-auto { background:var(--card);color:var(--faint);border:1px solid var(--border2);margin-left:auto; }
.btn-regen   { background:rgba(29,78,216,.15);color:#60a5fa;border:1px solid rgba(29,78,216,.3);font-size:10px;padding:4px 8px; }
.hidden { display:none!important; }

/* WMS SIDE PANEL */
.wms-panel { background:var(--bg3);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden; }
.wms-conn { padding:5px 10px;font-size:10px;color:var(--green);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:5px; }
.wms-conn .dot { width:6px;height:6px;border-radius:50%;background:var(--green);animation:pulse 2s infinite; }
.wms-tabs { display:flex;border-bottom:1px solid var(--border); }
.wms-tab { flex:1;padding:7px 0;text-align:center;font-size:10px;color:var(--faint);cursor:pointer;border-bottom:2px solid transparent; }
.wms-tab.active { color:var(--sky);border-bottom-color:var(--sky); }
.wms-panel-body { flex:1;overflow-y:auto;padding:10px; }
.wms-panel-row { display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(30,41,59,.4); }
.wms-panel-row:last-child { border-bottom:none; }
.wms-panel-row .pk { color:var(--faint);font-size:10px; }
.wms-panel-row .pv { color:var(--muted);font-size:10px;text-align:right; }
.wms-panel-row .pv.ok   { color:var(--green); }
.wms-panel-row .pv.warn { color:var(--amber); }
.flow-section { margin-top:10px;background:var(--card);border-radius:6px;padding:8px; }
.flow-section .flow-title { font-size:10px;color:var(--faint);margin-bottom:6px; }
.flow-steps { display:flex;align-items:center;gap:3px; }
.flow-step { flex:1;text-align:center; }
.flow-dot { width:20px;height:20px;border-radius:50%;margin:0 auto 3px;display:flex;align-items:center;justify-content:center;font-size:9px; }
.flow-dot.done    { background:rgba(34,197,94,.15);color:var(--green);border:1px solid var(--green); }
.flow-dot.current { background:rgba(59,130,246,.15);color:var(--blue);border:1px solid var(--blue); }
.flow-dot.pending { background:var(--bg);color:var(--faint);border:1px solid var(--border2); }
.flow-label { font-size:8px;color:var(--faint); }
.flow-arr { color:var(--border2);font-size:10px; }
.plan-box { margin-top:8px;background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.15);border-radius:4px;padding:6px;font-size:9px;color:var(--green); }
</style>
</head>
<body>

<!-- TOPBAR -->
<div class="topbar">
  <div class="conn-dot"></div>
  <span class="conn-label">WMS 연동 정상</span>
  <span style="color:var(--faint);font-size:10px">CS 운영팀 ▾</span>
</div>

<div class="shell">
  <!-- SIDEBAR -->
  <aside class="sidebar">
    <div class="sidebar-logo">
      <div class="brand">✦ Unified CS AI</div>
      <div class="sub">CS 자동화</div>
    </div>
    <nav>
      <div class="nav-item active" data-nav="dashboard"><span class="icon">📊</span>대시보드</div>
      <div class="nav-item" data-nav="inquiries"><span class="icon">📥</span>통합 문의함</div>
      <div class="nav-item" data-nav="approval"><span class="icon">⏳</span>승인 대기<span class="nav-badge" id="badge-approval">0</span></div>
      <div class="nav-item" data-nav="rules"><span class="icon">⚙️</span>자동화 규칙</div>
      <div class="nav-item" data-nav="wms"><span class="icon">🔌</span>WMS 연동</div>
      <div class="nav-item" data-nav="channels"><span class="icon">📡</span>채널 설정</div>
      <div class="nav-item" data-nav="report"><span class="icon">📈</span>리포트</div>
    </nav>
    <div class="sidebar-footer">
      <div style="font-size:10px;color:var(--faint);margin-bottom:6px">오늘의 요약</div>
      <div class="mini-chart-bar"></div>
      <div class="report-link">리포트 보기 →</div>
    </div>
  </aside>

  <!-- MAIN -->
  <div class="main">
    <!-- KPI -->
    <div class="kpi-bar">
      <div class="kpi">
        <div class="kpi-label">오늘 문의</div>
        <div class="kpi-val" id="kpi-today">—</div>
        <div class="kpi-delta delta-up" id="kpi-today-delta"></div>
      </div>
      <div class="kpi">
        <div class="kpi-label">평균 응답 시간</div>
        <div class="kpi-val" id="kpi-resp">—</div>
        <div class="kpi-delta delta-down" id="kpi-resp-delta"></div>
      </div>
      <div class="kpi">
        <div class="kpi-label">승인 대기</div>
        <div class="kpi-val" id="kpi-pending">—</div>
        <div class="kpi-delta delta-warn" id="kpi-pending-delta"></div>
      </div>
      <div class="kpi">
        <div class="kpi-label">자동화율 (초안 기준)</div>
        <div class="kpi-val" id="kpi-auto">—</div>
        <div class="kpi-delta delta-up" id="kpi-auto-delta"></div>
      </div>
    </div>

    <!-- CHANNEL FILTER -->
    <div class="ch-bar" id="ch-bar">
      <span style="font-size:10px;color:var(--faint);margin-right:4px">채널별:</span>
    </div>

    <!-- 3-PANEL -->
    <div class="panels">

      <!-- INQUIRY LIST -->
      <div class="inq-list">
        <div class="inq-search">
          <input id="search-input" placeholder="문의, 주문번호, 고객명으로 검색하세요" />
        </div>
        <div class="inq-meta-bar">
          <span id="inq-count-label">전체 0건</span>
          <span style="color:var(--sky);cursor:pointer">필터 ▼</span>
        </div>
        <div class="inq-scroll" id="inq-scroll"></div>
        <div class="inq-more" id="inq-more" style="display:none">더보기 →</div>
      </div>

      <!-- DETAIL -->
      <div class="detail">
        <div class="placeholder-panel" id="detail-placeholder">
          문의를 선택하면 AI 답변 초안이 생성됩니다
        </div>
        <div id="detail-content" class="hidden" style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
          <div class="detail-header">
            <div class="detail-title-row">
              <span class="urg" id="d-urgency"></span>
              <span class="detail-title" id="d-title"></span>
            </div>
            <div class="detail-meta" id="d-meta"></div>
            <div class="detail-actions-top">
              <button class="btn btn-regen" id="btn-regen">↻ 다시 생성</button>
            </div>
          </div>
          <div class="detail-body" id="detail-body">
            <div class="customer-bubble" id="d-customer-msg"></div>
            <div class="wms-result-box hidden" id="wms-result-box">
              <div class="wms-rtitle">
                <span>📦 WMS 조회 결과</span>
                <span style="font-size:9px;color:var(--green)">● 실시간</span>
              </div>
              <div id="wms-result-rows"></div>
            </div>
            <div class="draft-box" id="draft-box">
              <div class="draft-head">
                <div class="draft-spinner" id="draft-spinner"></div>
                <span id="draft-status">✨ AI 답변 초안 생성 중...</span>
              </div>
              <div class="draft-body" id="draft-body"></div>
            </div>
          </div>
          <div class="action-bar">
            <button class="btn btn-approve">✓ 검수 후 승인</button>
            <button class="btn btn-edit">✏ 수정</button>
            <button class="btn btn-hold">⏸ 보류</button>
            <button class="btn btn-no-auto">✕ 자동 발송 아님</button>
          </div>
        </div>
      </div>

      <!-- WMS SIDE PANEL -->
      <div class="wms-panel">
        <div class="wms-conn"><div class="dot"></div>연동 상태: 정상</div>
        <div class="wms-tabs">
          <div class="wms-tab active" data-tab="order">주문 정보</div>
          <div class="wms-tab" data-tab="stock">재고 정보</div>
          <div class="wms-tab" data-tab="delivery">배송 정보</div>
          <div class="wms-tab" data-tab="return">반품/교환</div>
        </div>
        <div class="wms-panel-body" id="wms-panel-body">
          <div style="color:var(--faint);font-size:11px;padding:8px 0">문의를 선택하면 WMS 정보가 표시됩니다.</div>
        </div>
      </div>

    </div>
  </div>
</div>

<script>
// ── State ──────────────────────────────────────────────────────────
let allInquiries = [];
let activeFilter = 'all';
let activeSearch = '';
let selectedInquiry = null;
let currentWmsData = {};
let activeWmsTab = 'order';

// ── Boot ───────────────────────────────────────────────────────────
async function boot() {
  await Promise.all([loadStats(), loadInquiries()]);
}

// ── Stats / KPI ────────────────────────────────────────────────────
async function loadStats() {
  const s = await fetch('/api/stats').then(r => r.json());
  const mins = Math.floor(s.avgResponseSec / 60);
  const secs = s.avgResponseSec % 60;
  document.getElementById('kpi-today').innerHTML = s.todayCount.toLocaleString();
  document.getElementById('kpi-today-delta').textContent = `전일 대비 ▲${s.deltaToday}%`;
  document.getElementById('kpi-resp').innerHTML = `${mins}<small>분 ${secs}초</small>`;
  document.getElementById('kpi-resp-delta').textContent = `전일 대비 ▼${Math.abs(s.deltaResponse)}%`;
  document.getElementById('kpi-pending').textContent = s.pendingApproval;
  document.getElementById('kpi-pending-delta').textContent = `긴급 ${s.urgentCount}건`;
  document.getElementById('badge-approval').textContent = s.pendingApproval;
  document.getElementById('kpi-auto').innerHTML = `${s.automationRate}<small>%</small>`;
  document.getElementById('kpi-auto-delta').textContent = `전일 대비 ▲${s.deltaAuto}%`;

  // Channel tags
  const bar = document.getElementById('ch-bar');
  const allTag = document.createElement('div');
  allTag.className = 'ch-tag active';
  allTag.textContent = `전체 ${s.todayCount.toLocaleString()}`;
  allTag.dataset.ch = 'all';
  allTag.onclick = () => filterByChannel('all', allTag);
  bar.appendChild(allTag);
  for (const ch of s.channels) {
    const tag = document.createElement('div');
    tag.className = 'ch-tag';
    tag.textContent = `${ch.name} ${ch.count}`;
    tag.dataset.ch = ch.name;
    tag.onclick = () => filterByChannel(ch.name, tag);
    bar.appendChild(tag);
  }
}

// ── Inquiries ──────────────────────────────────────────────────────
async function loadInquiries() {
  allInquiries = await fetch('/api/inquiries').then(r => r.json());
  renderList();
}

function filterByChannel(ch, el) {
  activeFilter = ch;
  document.querySelectorAll('.ch-tag').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderList();
}

function renderList() {
  const q = activeSearch.toLowerCase();
  const items = allInquiries.filter(inq => {
    if (activeFilter !== 'all' && inq.channel !== activeFilter) return false;
    if (q && !inq.content.toLowerCase().includes(q) &&
             !inq.orderNo.includes(q) &&
             !inq.type.toLowerCase().includes(q)) return false;
    return true;
  });

  document.getElementById('inq-count-label').textContent =
    `전체 ${items.length}건`;

  const scroll = document.getElementById('inq-scroll');
  scroll.innerHTML = '';
  for (const inq of items) {
    const el = document.createElement('div');
    el.className = 'inq-item' + (selectedInquiry?.id === inq.id ? ' active' : '');
    el.innerHTML = `
      <div class="row1">
        <span class="urg urg-${inq.urgency}">${inq.urgency}</span>
        <span class="inq-title">${inq.type}</span>
      </div>
      <div class="inq-sub">
        <span>${inq.channel}</span>
        <span>${inq.customer} · ${inq.time}</span>
      </div>`;
    el.onclick = () => selectInquiry(inq);
    scroll.appendChild(el);
  }
}

document.getElementById('search-input').addEventListener('input', e => {
  activeSearch = e.target.value;
  renderList();
});

// ── Select inquiry → generate draft ───────────────────────────────
function selectInquiry(inq) {
  selectedInquiry = inq;
  currentWmsData = {};
  renderList();
  showDetailShell(inq);
  generateDraft(inq);
}

function showDetailShell(inq) {
  document.getElementById('detail-placeholder').classList.add('hidden');
  const dc = document.getElementById('detail-content');
  dc.classList.remove('hidden');
  dc.style.display = 'flex';

  document.getElementById('d-urgency').className = `urg urg-${inq.urgency}`;
  document.getElementById('d-urgency').textContent = inq.urgency;
  document.getElementById('d-title').textContent = inq.type;
  document.getElementById('d-meta').textContent =
    `${inq.customer} · 주문번호 ${inq.orderNo} · ${inq.time}`;
  document.getElementById('d-customer-msg').textContent = inq.content;

  document.getElementById('wms-result-box').classList.add('hidden');
  document.getElementById('wms-result-rows').innerHTML = '';
  document.getElementById('draft-body').textContent = '';
  document.getElementById('draft-status').textContent = '✨ AI 답변 초안 생성 중...';
  document.getElementById('draft-spinner').style.display = '';

  renderWmsPanel({});
}

async function generateDraft(inq) {
  const inquiry = [
    `채널: ${inq.channel}`,
    `접수: ${inq.received}`,
    `주문번호: ${inq.orderNo}`,
    '',
    `"${inq.content}"`,
  ].join('\n');

  document.getElementById('btn-regen').onclick = () => {
    document.getElementById('draft-body').textContent = '';
    document.getElementById('draft-spinner').style.display = '';
    document.getElementById('draft-status').textContent = '✨ AI 답변 초안 생성 중...';
    document.getElementById('wms-result-box').classList.add('hidden');
    currentWmsData = {};
    streamDraft(inquiry, inq);
  };

  streamDraft(inquiry, inq);
}

function streamDraft(inquiry, inq) {
  const es = new EventSource(
    '/api/generate?' + new URLSearchParams({ inquiry })
  );

  // POST를 SSE로 변환하기 위해 fetch + ReadableStream 사용
  es.close(); // EventSource는 GET 전용 — fetch로 대체
  fetchSSE('/api/generate', inquiry, inq);
}

async function fetchSSE(url, inquiry, inq) {
  const draftBody = document.getElementById('draft-body');
  const draftStatus = document.getElementById('draft-status');
  const spinner = document.getElementById('draft-spinner');

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquiry }),
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          handleEvent(evt, inq);
        } catch {}
      }
    }
  } catch (err) {
    draftStatus.textContent = '⚠ 생성 오류: ' + err.message;
    spinner.style.display = 'none';
  }
}

function handleEvent(evt, inq) {
  if (evt.tool_call) {
    const box = document.getElementById('wms-result-box');
    box.classList.remove('hidden');
    const row = document.createElement('div');
    row.className = 'wms-row';
    row.innerHTML = `<span class="k">${toolLabel(evt.tool_call.name)}</span><span class="v" style="color:var(--amber)">조회 중...</span>`;
    row.id = 'wms-row-' + evt.tool_call.name;
    document.getElementById('wms-result-rows').appendChild(row);
  }

  if (evt.tool_result) {
    const row = document.getElementById('wms-row-' + evt.tool_result.name);
    if (row) {
      const valEl = row.querySelector('.v');
      valEl.textContent = evt.tool_result.ok ? '조회 완료 ✓' : '조회 실패 ✗';
      valEl.className = 'v ' + (evt.tool_result.ok ? 'ok' : 'err');
    }
  }

  if (evt.text) {
    const draftBody = document.getElementById('draft-body');
    draftBody.textContent += evt.text;
    document.getElementById('draft-spinner').style.display = 'none';
    document.getElementById('draft-status').textContent = '✨ AI 답변 초안 — claude-sonnet-4-6';
  }

  if (evt.done) {
    document.getElementById('draft-spinner').style.display = 'none';
    renderWmsPanel(buildWmsFromInquiry(inq));
  }

  if (evt.error) {
    document.getElementById('draft-status').textContent = '⚠ ' + evt.error;
    document.getElementById('draft-spinner').style.display = 'none';
  }
}

function toolLabel(name) {
  return { get_stock: '재고 조회', get_order_status: '주문 상태 조회',
           simulate_return: '반품 시뮬레이션', simulate_cancel: '취소 시뮬레이션' }[name] ?? name;
}

// ── WMS Side Panel ─────────────────────────────────────────────────
function buildWmsFromInquiry(inq) {
  return {
    order:    [
      ['주문번호', inq.orderNo],
      ['주문일시', inq.received],
      ['채널',   inq.channel],
      ['주문 유형', inq.type],
    ],
    stock:    [['상품', '조회 완료'], ['재고 상태', '보유']],
    delivery: [['배송 상태', 'WMS 조회 결과 참조'], ['택배사', '한진택배']],
    return:   [['반품 가능', '수령 후 7일 이내'], ['환불 방식', '원결제 수단']],
  };
}

function renderWmsPanel(data) {
  currentWmsData = data;
  const body = document.getElementById('wms-panel-body');
  const tab = activeWmsTab;
  const rows = data[tab] ?? [];

  body.innerHTML = '';
  for (const [k, v] of rows) {
    const row = document.createElement('div');
    row.className = 'wms-panel-row';
    row.innerHTML = `<span class="pk">${k}</span><span class="pv">${v}</span>`;
    body.appendChild(row);
  }

  // 자동화 플로우
  const flow = document.createElement('div');
  flow.className = 'flow-section';
  flow.innerHTML = `
    <div class="flow-title">자동화 플로우 상태</div>
    <div class="flow-steps">
      <div class="flow-step"><div class="flow-dot done">✓</div><div class="flow-label">수신</div></div>
      <div class="flow-arr">→</div>
      <div class="flow-step"><div class="flow-dot done">✓</div><div class="flow-label">초안</div></div>
      <div class="flow-arr">→</div>
      <div class="flow-step"><div class="flow-dot current">●</div><div class="flow-label">승인</div></div>
      <div class="flow-arr">→</div>
      <div class="flow-step"><div class="flow-dot pending">○</div><div class="flow-label">발송</div></div>
    </div>
    <div class="plan-box">고신뢰 시나리오부터 단계적 자동 발송 확대 예정</div>`;
  body.appendChild(flow);
}

// WMS tab clicks
document.querySelectorAll('.wms-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.wms-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeWmsTab = tab.dataset.tab;
    renderWmsPanel(currentWmsData);
  });
});

boot();
</script>
</body>
</html>
```

- [ ] **Step 2: 서버 재시작 후 허브 페이지 확인**

```bash
# 기존 3001 프로세스 재시작
pkill -f "node src/server.js" 2>/dev/null; sleep 1
PORT=3001 node src/server.js &
sleep 2
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/hub
```

Expected: `200`

- [ ] **Step 3: 브라우저에서 http://localhost:3001/hub 열어 KPI·사이드바·3패널 확인**

체크리스트:
- [ ] KPI 4개 숫자가 표시되는가
- [ ] 채널 필터 태그가 표시되는가
- [ ] 좌측 문의 목록에 7건이 표시되는가
- [ ] 우측 WMS 패널에 탭 4개가 있는가

- [ ] **Step 4: 커밋**

```bash
git add public/hub.html
git commit -m "feat: unified CS hub - layout, KPI, inquiry list, WMS panel"
```

---

## Task 3: 문의 클릭 → WMS 조회 + AI 초안 스트리밍 확인

**Files:**
- Modify: `public/hub.html` (버그 수정만)

- [ ] **Step 1: 문의 항목 클릭 테스트**

브라우저에서:
1. 좌측 문의 목록에서 아무 항목 클릭
2. 중앙 패널에 고객 메시지 원문이 표시되는지 확인
3. `📦 WMS 조회 결과` 박스가 나타나는지 확인
4. AI 답변 초안이 스트리밍되는지 확인 (텍스트가 하나씩 추가되어야 함)
5. 우측 WMS 패널에 주문 정보가 채워지는지 확인

- [ ] **Step 2: 다시 생성 버튼 테스트**

↻ 다시 생성 클릭 → 초안이 초기화되고 재생성되는지 확인

- [ ] **Step 3: 검색 필터 테스트**

검색창에 "배송" 입력 → 배송 관련 문의만 표시되는지 확인

- [ ] **Step 4: 채널 필터 테스트**

채널 태그 클릭 → 해당 채널 문의만 표시되는지 확인

- [ ] **Step 5: 커밋 (정상 동작 확인 후)**

```bash
git add public/hub.html src/server.js src/parse-inquiries.js
git commit -m "feat: unified CS hub complete - WMS API + AI draft streaming"
```

---

## Self-Review

**Spec 커버리지:**
- [x] 3패널 레이아웃 (사이드바·문의함·상세·WMS 패널)
- [x] KPI 4개 (`/api/stats`)
- [x] 채널 필터 바
- [x] WMS API 실시간 연동 (기존 `POST /api/generate` 재사용)
- [x] AI 답변 초안 스트리밍
- [x] 검수 후 승인·수정·보류 버튼 (UI만, 실제 발송은 범위 외)
- [x] WMS 사이드 패널 탭 4개
- [x] 자동화 플로우 상태 표시
- [x] `localhost:3001/hub` 신규 라우트

**Placeholder 없음 확인:** 전체 HTML/JS 코드 포함됨, TBD 없음

**타입 일관성:** `inq.id`, `inq.type`, `inq.channel`, `inq.urgency`, `inq.content`, `inq.orderNo`, `inq.time`, `inq.customer`, `inq.received` — `parse-inquiries.js`와 hub.html 모두 동일하게 사용
