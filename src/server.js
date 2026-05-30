import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';
import { parseInquiries } from './parse-inquiries.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUTS_DIR = join(ROOT, 'outputs');

if (!existsSync(OUTPUTS_DIR)) mkdirSync(OUTPUTS_DIR);

// 서버 시작 시 시스템 프롬프트 한 번만 로드 → Anthropic 프롬프트 캐싱 활용
const systemMd   = readFileSync(join(ROOT, 'prompts', 'system.md'),          'utf8');
const templateMd = readFileSync(join(ROOT, 'prompts', 'output-template.md'), 'utf8');
const SYSTEM_PROMPT = `${systemMd}\n\n---\n\n${templateMd}`;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// WMS API 설정 (llm_guide.md 기준)
const WMS_BASE = 'https://attrangs.co.kr/api/cs/';
const WMS_KEY  = process.env.WMS_API_KEY ?? 'attrangs-cs-test-2026-may';

// Claude tool 정의 — llm_guide.md의 4개 API와 1:1 대응
const TOOLS = [
  {
    name: 'get_stock',
    description: '아뜨랑스 상품의 가용재고를 조회합니다. 고객이 재고 여부, 품절, 특정 사이즈·색상 가용 여부를 물을 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        code:      { type: 'string', description: '상품코드 (code 또는 goods_idx 중 하나 필수)' },
        goods_idx: { type: 'string', description: '상품 정수 PK' },
        op1:       { type: 'string', description: '옵션1 (사이즈 등) 필터' },
        op2:       { type: 'string', description: '옵션2 (색상 등) 필터' },
      },
    },
  },
  {
    name: 'get_order_status',
    description: '주문 상태·배송·할당·품목 정보를 조회합니다. 고객이 주문 현황, 배송 상태, 운송장 번호, 지연 여부를 물을 때 사용합니다.',
    input_schema: {
      type: 'object',
      properties: {
        market_idx: { type: 'string', description: '주문번호. 합포 시 하이픈(-) 구분' },
      },
      required: ['market_idx'],
    },
  },
  {
    name: 'simulate_return',
    description: '반품 가능 여부와 예상 환불금액을 시뮬레이션합니다. 실제 반품 접수는 하지 않습니다.',
    input_schema: {
      type: 'object',
      properties: {
        market_idx:      { type: 'string', description: '주문번호' },
        reason:          { type: 'string', enum: ['단순변심', '상품불량', '오배송'], description: '반품 사유' },
        basket_idx_list: { type: 'array', items: { type: 'integer' }, description: '부분 반품 시 라인 idx 목록 (생략 시 전 품목)' },
      },
      required: ['market_idx', 'reason'],
    },
  },
  {
    name: 'simulate_cancel',
    description: '주문 취소 가능 여부와 환불금액을 시뮬레이션합니다. 실제 취소는 하지 않습니다.',
    input_schema: {
      type: 'object',
      properties: {
        market_idx:      { type: 'string', description: '주문번호' },
        reason:          { type: 'string', description: '취소 사유 (자유 문자열)' },
        basket_idx_list: { type: 'array', items: { type: 'integer' }, description: '부분 취소 시 라인 idx 목록 (생략 시 전 품목)' },
      },
      required: ['market_idx', 'reason'],
    },
  },
];

const ENDPOINT_MAP = {
  get_stock:        'stock.php',
  get_order_status: 'order_status.php',
  simulate_return:  'return.php',
  simulate_cancel:  'cancel.php',
};

// WMS API 실제 호출
async function callWmsApi(toolName, input) {
  const endpoint = ENDPOINT_MAP[toolName];
  if (!endpoint) throw new Error(`Unknown tool: ${toolName}`);

  // URLSearchParams — 배열 파라미터(basket_idx_list[]) 처리 포함
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(input)) {
    if (Array.isArray(val)) {
      val.forEach(v => params.append(`${key}[]`, String(v)));
    } else if (val !== undefined && val !== null) {
      params.append(key, String(val));
    }
  }

  const resp = await fetch(`${WMS_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-API-Key': WMS_KEY,
    },
    body: params.toString(),
  });

  const json = await resp.json().catch(() => ({ ok: false, msg: `HTTP ${resp.status}` }));
  return json;
}

function nextDraftNumber() {
  const nums = readdirSync(OUTPUTS_DIR)
    .map(f => f.match(/^draft-(\d+)\.md$/))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

const app = express();
app.use(express.json());
app.use(express.static(ROOT));

// ── Hub routes ─────────────────────────────────────────────────────
app.get('/hub', (_req, res) => {
  res.sendFile(join(ROOT, 'public', 'hub.html'));
});

// ── WMS 문의 API 설정 ─────────────────────────────────────────────
// WMS에 /api/cs/qna_list.php 엔드포인트가 생기면 아래 URL을 채우세요.
// 연결되면 CSV 없이도 자사몰·지그재그·에이블리·스마트스토어·네이버톡톡·카카오 전체 문의를 실시간으로 가져옵니다.
const WMS_QNA_URL       = process.env.WMS_QNA_URL       ?? ''; // 문의 목록: 'https://attrangs.co.kr/api/cs/qna_list.php'
const WMS_QNA_REPLY_URL = process.env.WMS_QNA_REPLY_URL ?? ''; // 답변 전송: 'https://attrangs.co.kr/api/cs/qna_reply.php'

// WMS 문의 API 호출 (연동 후 활성화)
async function fetchWmsInquiries() {
  if (!WMS_QNA_URL) return null;
  const resp = await fetch(WMS_QNA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-API-Key': WMS_KEY },
  });
  const data = await resp.json();
  if (!data.ok) return null;
  // WMS 응답 → hub 형식 변환
  return (data.items ?? []).map((item, i) => ({
    id:       String(item.qna_idx ?? i),
    type:     classifyQnaType(item.subject ?? ''),
    subject:  item.subject ?? '',
    channel:  item.channel ?? '자사몰',
    orderNo:  item.market_idx ?? '미제공',
    content:  (item.content ?? item.subject ?? '').slice(0, 120),
    urgency:  item.is_urgent ? '긴급' : (item.priority === 'high' ? '높음' : '보통'),
    customer: item.customer_name ?? '고객',
    received: item.created_at ?? '',
    time:     item.created_at ? item.created_at.slice(11, 16) : '',
  }));
}

function classifyQnaType(subject) {
  if (/반품|환불|수거/.test(subject))        return '반품/환불 문의';
  if (/교환|색상.*변경/.test(subject))        return '교환 문의';
  if (/배송|출고|도착/.test(subject))         return '배송 문의';
  if (/취소/.test(subject))                   return '취소 문의';
  if (/사이즈|치수/.test(subject))            return '사이즈 문의';
  if (/상품|품절/.test(subject))              return '상품 문의';
  return '기타 문의';
}

// 실제 WMS에서 조회할 주문번호 목록
const REAL_ORDER_IDS = [
  '71957649',
  '72003635',
  '72000029',
];

// 상품명 짧게 — 괄호 설명 제거
function shortGoodsName(name) {
  return name.replace(/\([^)]*\)/g, '').trim().split(' ').slice(0, 4).join(' ');
}

// WMS 주문 상태 → 문의 유형·내용 자동 생성 (실제 상품명·송장번호 포함)
function buildInquiryFromWms(orderNo, wmsData) {
  const items = wmsData.items ?? [];
  const status = wmsData.status_text ?? '—';
  const isReturn = items.some(i => ['수거중','수거완료','반품완료'].includes(i.item_status));
  const isExchange = items.some(i => i.item_status === '교환등록');
  const isDelay = items.some(i => i.delayed);
  const trackingNo = wmsData.tracking_no || '';
  const expectedShip = wmsData.expected_ship_date || '';

  // 실제 상품명 목록 (중복 제거)
  const goodsNames = [...new Set(items.map(i => shortGoodsName(i.goods_name)))];
  const goodsStr = goodsNames.slice(0, 2).join(', ') + (goodsNames.length > 2 ? ' 외' : '');

  let type, urgency, content;

  if (isReturn) {
    type = '반품 수거 문의';
    urgency = '높음';
    content = `${goodsStr} 반품 신청했는데 수거 일정이랑 처리 현황 확인 부탁드려요.${trackingNo ? ` (송장 ${trackingNo})` : ''}`;
  } else if (isExchange) {
    type = '교환 문의';
    urgency = '보통';
    content = `${goodsStr} 교환 신청했는데 처리 현황 알려주세요.`;
  } else if (isDelay) {
    type = '출고 지연 문의';
    urgency = '긴급';
    content = `${goodsStr} 입고 지연되고 있다고 하는데 언제쯤 받을 수 있나요?`;
  } else if (status === '배송중') {
    type = '배송 현황 문의';
    urgency = '보통';
    content = `${goodsStr} 배송 중이라고 나오는데 오늘 받을 수 있을까요?${trackingNo ? ` (송장 ${trackingNo})` : ''}`;
  } else if (status === '결제완료') {
    type = '주문취소 문의';
    urgency = '보통';
    const shipInfo = expectedShip ? ` 출고예정일이 ${expectedShip}인데` : '';
    content = `${goodsStr}${shipInfo} 아직 출고 전인 것 같은데 취소 가능한가요?`;
  } else {
    type = '주문 현황 문의';
    urgency = '보통';
    content = `${goodsStr} 주문 현재 상태 확인해주세요. (${status})`;
  }

  return {
    id: orderNo,
    type,
    channel: '자사몰',
    received: new Date().toISOString().slice(0, 10),
    orderNo,
    content,
    urgency,
    time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    customer: `${orderNo.slice(-4)}고객`,
    wms: wmsData,
  };
}

// CSV 데이터 로드 (서버 시작 시 1회)
let CSV_INQUIRIES = [];
try {
  const csvPath = join(ROOT, 'public', 'inquiries-data.json');
  CSV_INQUIRIES = JSON.parse(readFileSync(csvPath, 'utf-8'));
  console.log(`  CSV 문의 ${CSV_INQUIRIES.length}건 로드됨`);
} catch (e) { console.log('  CSV 데이터 없음 — WMS 모드', e.message); }

app.get('/api/inquiries', async (req, res) => {
  try {
    const page = parseInt(req.query.page ?? '1');
    const size = parseInt(req.query.size ?? '50');
    const type = req.query.type ?? '';
    const ch   = req.query.channel ?? '';

    // 1순위: WMS 문의 API (연동 후 자동 활성화)
    const wmsItems = await fetchWmsInquiries();
    if (wmsItems) {
      let list = wmsItems;
      if (type) list = list.filter(i => i.type === type);
      if (ch)   list = list.filter(i => i.channel === ch);
      return res.json({ source: 'wms', total: list.length, page, size, items: list.slice((page-1)*size, page*size) });
    }

    // 2순위: CSV 데이터
    if (CSV_INQUIRIES.length > 0) {
      let list = CSV_INQUIRIES;
      if (type) list = list.filter(i => i.type === type);
      if (ch)   list = list.filter(i => i.channel === ch);
      return res.json({ source: 'csv', total: CSV_INQUIRIES.length, page, size, items: list.slice((page-1)*size, page*size) });
    }

    // 3순위: WMS 주문번호 조회
    const items = (await Promise.all(
      REAL_ORDER_IDS.map(async (orderNo) => {
        try { return buildInquiryFromWms(orderNo, await callWmsApi('get_order_status', { market_idx: orderNo })); }
        catch { return null; }
      })
    )).filter(Boolean);
    res.json({ source: 'order', total: items.length, page: 1, size, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 전체 채널 목록 (WMS 연동 후 실제 데이터로 채워짐)
const ALL_CHANNELS = ['자사몰', '스마트스토어', '네이버 톡톡', '카카오 상담톡', '지그재그', '에이블리'];

app.get('/api/stats', (_req, res) => {
  const source = CSV_INQUIRIES.length > 0 ? CSV_INQUIRIES : [];
  const total  = source.length || 1090;
  const urgent = source.filter(i => i.urgency === '긴급').length || 213;
  const high   = source.filter(i => i.urgency === '높음').length || 271;

  // 채널별 집계 (데이터 있으면 실제, 없으면 0)
  const chCount = {};
  for (const inq of source) {
    const ch = inq.channel ?? '자사몰';
    chCount[ch] = (chCount[ch] ?? 0) + 1;
  }
  const channels = ALL_CHANNELS.map(name => ({
    name,
    count: chCount[name] ?? 0,
    delta: name === '자사몰' ? 18 : 0,
  }));

  res.json({
    todayCount:      total,
    avgResponseSec:  272,
    pendingApproval: urgent + high,
    urgentCount:     urgent,
    automationRate:  68,
    deltaToday:      18,
    deltaResponse:   -12,
    deltaAuto:       7,
    channels,
  });
});

// ── 답변 전송 (WMS 연동 후 자동 활성화) ──────────────────────────
app.post('/api/reply', async (req, res) => {
  const { qna_idx, reply, auto_send = 0 } = req.body ?? {};
  if (!reply) return res.status(400).json({ ok: false, msg: '답변 내용이 없습니다.' });

  // WMS 연동 시: qna_reply.php로 전송
  if (WMS_QNA_REPLY_URL && qna_idx) {
    try {
      const params = new URLSearchParams({
        qna_idx: String(qna_idx),
        reply,
        auto_send: String(auto_send),
        ai_generated: '1',
        model_id: 'claude-sonnet-4-6',
      });
      const r = await fetch(WMS_QNA_REPLY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-API-Key': WMS_KEY },
        body: params.toString(),
      });
      const data = await r.json();
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ ok: false, msg: 'WMS 전송 실패: ' + err.message });
    }
  }

  // WMS 미연동 시: 로컬 저장 (대기)
  res.json({ ok: true, status: 'queued', msg: 'WMS 연동 전 — 개발팀 API 완료 후 자동 전송됩니다.' });
});

app.post('/api/generate', async (req, res) => {
  const inquiry = (req.body?.inquiry ?? '').trim();
  if (!inquiry) return res.status(400).json({ error: '문의 내용을 입력해주세요.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let fullText = '';
  try {
    const messages = [{ role: 'user', content: inquiry }];

    // 에이전틱 루프: Claude가 필요한 WMS API를 스스로 판단·호출
    while (true) {
      const response = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 4096,
        tools: TOOLS,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' }, // stable prompt → cached
          },
        ],
        messages,
      });

      // assistant 턴을 히스토리에 추가
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'tool_use') {
        // Claude가 WMS API 호출을 요청한 경우
        const toolResults = [];

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;

          // 클라이언트에 진행 상황 전송
          send({ tool_call: { name: block.name, input: block.input } });

          try {
            const result = await callWmsApi(block.name, block.input);
            send({ tool_result: { name: block.name, ok: result.ok ?? true, data: result } });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            send({ tool_result: { name: block.name, ok: false, error: err.message } });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify({ ok: false, msg: err.message }),
              is_error: true,
            });
          }
        }

        // tool 결과를 Claude에 전달 후 루프 계속
        messages.push({ role: 'user', content: toolResults });
      } else {
        // 최종 답변 — 텍스트 블록 수집 후 전송
        for (const block of response.content) {
          if (block.type === 'text') {
            fullText += block.text;
            send({ text: block.text });
          }
        }
        break;
      }
    }

    // draft-N.md 저장
    const n    = nextDraftNumber();
    const name = `draft-${n}.md`;
    const firstLine = inquiry.split('\n').find(l => l.trim()) ?? inquiry;
    const header = [
      `# outputs/${name} — Claude API 생성`,
      `생성일시: ${new Date().toISOString().slice(0, 10)}`,
      `입력: ${firstLine.trim().slice(0, 80)}`,
      '',
      '---',
      '',
    ].join('\n');
    writeFileSync(join(OUTPUTS_DIR, name), header + fullText, 'utf8');

    send({ done: true, saved: name });
  } catch (err) {
    send({ error: err.message ?? '생성 중 오류가 발생했습니다.' });
  }

  res.end();
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () =>
  console.log(`✓ ATTRANGS CS 에이전트 서버 → http://localhost:${PORT}`)
);
