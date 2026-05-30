import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

// EUC-KR 읽기 시도, 실패하면 UTF-8
let text;
try {
  const buf = readFileSync('C:/Users/yj-pl/OneDrive/문서/카카오톡 받은 파일/260424 아뜨 qna 7일치.csv');
  const td = new TextDecoder('euc-kr');
  text = td.decode(buf);
} catch {
  text = readFileSync('C:/Users/yj-pl/OneDrive/문서/카카오톡 받은 파일/260424 아뜨 qna 7일치.csv', 'utf-8');
}

// CSV 파싱 (따옴표 안 개행 처리)
function parseCSV(str) {
  const rows = [];
  let cur = [], field = '', inQ = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"') {
      if (inQ && str[i+1] === '"') { field += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      cur.push(field); field = '';
    } else if ((c === '\n' || (c === '\r' && str[i+1] === '\n')) && !inQ) {
      if (c === '\r') i++;
      cur.push(field); field = '';
      rows.push(cur); cur = [];
    } else {
      field += c;
    }
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

const rows = parseCSV(text);
const header = rows[0];
console.log('헤더:', header);
console.log('총 행수:', rows.length - 1);

const classifyType = (subject) => {
  if (/반품|환불|수거/.test(subject)) return '반품/환불 문의';
  if (/교환|색상.*변경|변경.*색상/.test(subject)) return '교환 문의';
  if (/사이즈.*교환|교환.*사이즈/.test(subject)) return '교환 문의';
  if (/배송|출고|도착|언제.*오/.test(subject)) return '배송 문의';
  if (/취소/.test(subject)) return '취소 문의';
  if (/사이즈|치수|핏/.test(subject)) return '사이즈 문의';
  if (/상품|품절|재입고/.test(subject)) return '상품 문의';
  return '기타 문의';
};

const urgency = (memo) => {
  if (/지연.*[5-9]일|8일|긴급|빠른|오늘.*출발|내일.*도착|아직.*안.*왔|못.*받/.test(memo)) return '긴급';
  if (/지연|아직|언제|빠르게/.test(memo)) return '높음';
  return '보통';
};

const extractOrder = (memo) => {
  const m = memo.match(/주문번호[\s:：]*(\d{7,10})/) || memo.match(/(\d{8,10})/);
  return m ? m[1] : '미제공';
};

const extractCustomer = (memo) => {
  const m = memo.match(/성함[\s:：]*([가-힣]{2,5})/) || memo.match(/([가-힣]{2,4})\s*\n/) || memo.match(/이름[\s:：]*([가-힣]{2,5})/);
  return m ? m[1] : '고객';
};

const inquiries = [];
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || row.length < 2) continue;
  const subject = (row[0] || '').trim();
  const memo    = (row[1] || '').trim();
  if (!subject && !memo) continue;

  // 문의 내용 — 불필요한 안내문 제거
  const lines = memo.split('\n').map(l => l.trim()).filter(l =>
    l.length > 8 &&
    !/아뜨랑스|문의 사항|주문번호|성함|연락처|고객님.*성함|보다 빠르고/.test(l)
  );
  const content = lines[0] || subject;

  inquiries.push({
    id: String(i),
    type: classifyType(subject),
    subject,
    channel: '자사몰',
    orderNo: extractOrder(memo),
    content: content.slice(0, 120),
    urgency: urgency(memo),
    customer: extractCustomer(memo),
    received: '2026-04-24',
    time: '',
    wms: null,
  });
}

// 유형별 통계
const stats = {};
for (const inq of inquiries) {
  stats[inq.type] = (stats[inq.type] || 0) + 1;
}
console.log('\n유형별 통계:');
Object.entries(stats).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${v}건  ${k}`));

writeFileSync('C:/Users/yj-pl/ai-camp-week2/public/inquiries-data.json', JSON.stringify(inquiries, null, 0), 'utf-8');
console.log(`\n저장 완료: ${inquiries.length}건 → public/inquiries-data.json`);
