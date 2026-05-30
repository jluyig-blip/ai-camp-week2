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
