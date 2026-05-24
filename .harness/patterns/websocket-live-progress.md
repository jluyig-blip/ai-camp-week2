# 패턴 — WebSocket 실시간 진행 표시

> 자동화 프로덕트는 백그라운드에서 여러 LLM 호출이 병렬로 돈다. 그 과정을 **실시간으로 UI에 반영**하는 WebSocket 패턴.

---

## 엔드포인트 구조

- `WS /ws/runs/{run_id}` — run 단위로 채널
- 서버 → 클라이언트: 단방향 이벤트 스트림
- 클라이언트 → 서버: keep-alive ping (25초 간격)

---

## 이벤트 타입

| 이벤트 | payload | UI 반응 |
|---|---|---|
| `blueprint.started` | `{provider}` | 로딩 표시 |
| `blueprint.completed` | `{blueprint_id, content}` | Form으로 전환 |
| `blueprint.error` | `{error, provider}` | 에러 배너 |
| `component.generating` | `{component_id, type, chapter_id, generator}` | Kanban "생성중"에 카드 추가 |
| `component.generated` | `{component_id, type, chapter_id}` | "검증중"으로 이동 |
| `component.validated` | `{component_id, type, chapter_id, passed, score}` | "통과"로 이동 (또는 "플래그") |
| `component.flagged` | 같음 | "플래그"로 이동 |
| `component.regenerating` | `{component_id, type, chapter_id, retry, reason}` | "생성중"으로 이동 (retry 카운트 표시) |
| `component.error` | `{component_id, error}` | 에러 배너 |
| `chapter.regen_started` | `{chapter_id, components, instruction}` | 챕터 패널 업데이트 |
| `chapter.regen_completed` | `{chapter_id}` | 토스트 + 트리 갱신 |
| `run.completed` | `{}` | Review 탭으로 자동 이동 + 토스트 |

---

## 이벤트 페이로드 필수 요소

**모든 component.* 이벤트에 반드시 포함**:
- `component_id` (추적용)
- `type` (한글 라벨 매핑용)
- `chapter_id` (위치 표시용, figure_rationale 등 챕터 없는 건 `-`)

> 누락하면 UI가 "단일 컴포넌트 · undefined" 같은 이상한 라벨을 표시 (실제 이 프로젝트 초기 버그였음)

---

## 프론트엔드 패턴

```js
const state = { ws: null, runId: null };

function openWs(runId) {
  if (state.ws) try { state.ws.close(); } catch(e) {}
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${proto}//${location.host}/ws/runs/${runId}`);
  state.ws.onmessage = (ev) => handleEvent(JSON.parse(ev.data));
  // keep-alive
  setInterval(() => {
    if (state.ws?.readyState === 1) state.ws.send('ping');
  }, 25000);
}

function handleEvent(m) {
  const t = m.event, p = m.payload || {};
  logEvent(t, p);  // 모든 이벤트는 로그에 기록
  if (t === 'blueprint.completed') showBlueprint(p.content);
  else if (t.startsWith('component.')) refreshRunData();
  else if (t === 'run.completed') switchTab('review');
  else if (t.endsWith('.error')) showError(p.error);
}
```

---

## 백엔드 패턴 (FastAPI)

```python
class WSManager:
    def __init__(self):
        self._by_run: dict[str, list[WebSocket]] = defaultdict(list)

    async def push(self, run_id: str, event: str, payload: dict):
        msg = json.dumps({"event": event, "run_id": run_id, "payload": payload}, ensure_ascii=False)
        for ws in list(self._by_run.get(run_id, [])):
            try: await ws.send_text(msg)
            except: pass  # disconnected
```

오케스트레이터가 각 단계에서 `emit(run_id, event_type, payload)` 호출.

---

## Error Handling

- WS 연결 끊김: 클라이언트 3초 후 재연결 시도
- 서버 restart: 기존 연결 자동 drop → 클라이언트 감지 → 재연결 + 상태 재조회 (`GET /api/runs/{id}`)
- 이벤트 수신 중 프런트 예외: `console.warn` + 다음 이벤트는 정상 처리

---

## Event Log UI

- `<details>` 접이식 기본 접힘 ("뭔가 궁금할 때만 열어봄")
- 라인 포맷: `[HH:MM:SS] {event_type} {payload 요약 120자}`
- 색상: 에러=rose, 성공/완료=emerald, 재생성=amber, 기타=zinc
- 스크롤 맨 아래 자동 이동

---

## Anti-패턴

- ❌ 이벤트 타입마다 컴포넌트 전체 refetch (네트워크 낭비) — 필요한 것만 증분 업데이트
- ❌ 페이로드에 type/chapter_id 누락
- ❌ 에러 이벤트를 로그에만 찍고 UI 에러 배너 표시 안 함
- ❌ WebSocket 끊겨도 재연결 없음 (새로고침만 해결책)

---

## 관련 원칙

→ [`principles.md`](../principles.md) §2 과정 시각화
