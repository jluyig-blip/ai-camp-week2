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
    const stream = client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },  // stable prompt → cached
        },
      ],
      messages: [{ role: 'user', content: inquiry }],
    });

    stream.on('text', (text) => {
      fullText += text;
      send({ text });
    });

    await stream.finalMessage();

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
