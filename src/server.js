import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

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
            send({ tool_result: { name: block.name, ok: result.ok ?? true } });
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
