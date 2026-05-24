# Pattern — Agent-side CLI Companion

> 웹 서비스 옆에 붙어서, 에이전트(Claude Code / Codex)와 사용자가 같이 다룰 수 있는
> 동반자 CLI. camp-lms ↔ @scaila/camp-cli 가 이 패턴의 레퍼런스 구현.

## 언제 쓰나
- 사용자가 자기 데이터(글·과제·자산)를 *작성/제출*하는 흐름이 핵심일 때
- 그 작성을 에이전트가 거들 수 있게 하고 싶을 때 (자연어 → 명령)
- 웹 UI 만으론 마찰이 크거나, 터미널 워크플로우와 연동이 필요할 때

## 핵심 원칙
1. **읽기는 웹, 쓰기는 CLI** — CLI는 작성/제출 같은 *생성형* 작업에 집중. 읽기·검색·수정·삭제는 웹 대시보드에 두는 게 사용자도 운영자도 명확.
2. **토큰 1개 = 사용자 1명** — 학생/사용자별로 1회용 정도의 인증 토큰을 발급. 토큰은 사용자 ID + 그룹/조직 ID와 1:1 매칭.
3. **사칭 불가** — 라우트 핸들러에서 body 의 user_id 를 무시하고 토큰에서 끌어온 값으로 덮어씀.
4. **에이전트는 `--yes` 로 통과** — 인터랙티브 확인(`y/N`)을 모든 쓰기 명령에 두되, `--yes` 플래그로 비대화형 실행 가능. 에이전트는 사용자에게 채팅에서 먼저 확인받고 `--yes` 로 실행.

## 구성 요소
```
[사용자]                                                  [서버]
  ├─ 대시보드 (웹)        ◀──── auth.uid() / RLS ──────  Supabase
  │   - 읽기·검색·수정·삭제
  │   - [터미널 연결] 카드 (코드 발급)
  └─ 터미널
      └─ npx <package> @latest
          ├─ login (코드→토큰)                                ─POST /api/auth/resolve-code
          ├─ init  (워크스페이스)                              ─GET  /api/workspace/manifest
          ├─ status                                            ─GET  /api/.../bootstrap
          ├─ <도메인> post --yes  ◀── 미리보기·확인           ─POST /api/<도메인>/posts
          └─ <도메인> submit --yes                             ─POST /api/<도메인>/submissions
                ▲
                Claude Code / Codex 가 학생 동의 후 자동 호출
```

## 인증 흐름 (camp-lms 의 setup_links 패턴)

```
1. 관리자가 사용자 만들 때 setup_links 행 생성:
   { user_id, group_id, token_hash:sha256(token), short_code:6자리, expires_at }

2. 대시보드 [터미널 연결] 카드가 short_code 를 표시.

3. CLI 가 POST /api/auth/resolve-code { shortCode } 호출:
   - 서버: 토큰 회전 (보안)
   - 응답: { setupUrl: "https://.../setup/<NEW_TOKEN>", expiresAt }
   - CLI: URL 에서 토큰 추출 → ~/.camp/credentials.json 저장

4. 이후 모든 요청: Authorization: Bearer <token>
   - 서버: sha256(token) 으로 setup_links 조회 → revoked/expired 체크 → link 반환
   - link.user_id, link.group_id 가 인증된 사용자 정체

5. 권한 회수:
   - admin 이 setup_links.revoked_at 찍음 → 그 즉시 401
```

## 쓰기 라우트 골격 (인가 강제)

```ts
// POST /api/<도메인>/posts
const link = await authenticateSetupToken(req)
if (!link) return 401

const body = await req.json()
// service_role 로 RLS 우회 (setup-token 으론 auth.uid() 못 만듦)
await supabaseAdmin().from('<table>').insert({
  ...sanitize(body),
  user_id:  link.userId,     // ← 토큰에서 강제 (body 의 user_id 무시)
  group_id: link.groupId,    // ← 그룹 격리 강제
})
```

## 디자인 토큰 (이 패턴 전용)
- 부트스트랩 단계 표시: `--st-info-bg / --st-info-fg` (5 step 진행 표시)
- 성공/실패: `--st-ok-* / --st-err-*`
- "토큰" "코드" 같은 보안 단어는 절대 화면에 그대로 출력하지 않음 — 마스킹 또는 파일 저장.

## 안티패턴
- 토큰을 .env 같은 곳에 학생이 직접 붙여넣게 하기 (대신 6자리 코드 + 자동 교환)
- CLI에 읽기/수정/삭제까지 다 넣기 (웹에 두는 게 일관·간단)
- 사용자가 user_id 를 body 에 넣게 하기 (사칭 통로)
- 인터랙티브 프롬프트만 제공 (`--yes` 없으면 에이전트가 못 씀)

## 레퍼런스 구현
- 서버: `camp-lms/src/app/api/community/posts/route.ts`, `src/lib/api-auth.ts`, `src/app/api/setup/resolve-code/route.ts`
- CLI: `@scaila/camp-cli` (`lib/commands/login.js`, `lib/commands/community.js`, `lib/auth.js`)
