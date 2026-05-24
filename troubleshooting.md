# 문제 해결

## `node` / `npx` 명령을 못 찾는다고 나옴
- Node.js LTS 가 없을 가능성. **Node v18 이상** 이 필요합니다.
- **macOS**: `brew install node` (Homebrew) 또는 [nodejs.org](https://nodejs.org/ko) 에서 LTS 다운로드.
- **Windows**: [nodejs.org](https://nodejs.org/ko) 에서 LTS 설치 (PowerShell 또는 Windows Terminal 권장).
- 설치 후 **터미널을 완전히 닫았다 다시 열어야** PATH가 반영됩니다.

## Windows 사용자
- **터미널**: PowerShell, Windows Terminal, Git Bash 모두 OK. cmd.exe 도 작동하지만 한글 깨질 수 있어서 위 셋 중 하나 권장.
- `claude` / `codex` 실행이 안 될 때: PATH 에 `%APPDATA%\npm\` 가 포함돼 있는지 확인. 보통 npm 글로벌 설치 시 자동 추가됨.
- `~/.camp/` 는 Windows 에서 `C:\Users\<사용자>\.camp\` 로 매핑.

## "토큰이 만료됐습니다" / 401
- 토큰이 만료(기본 60일)되었거나 관리자가 회수.
- 대시보드 [터미널] 탭에서 새 코드를 받아 `npx @scaila/camp-cli login --force` 다시.

## 코드를 넣어도 "코드를 찾을 수 없습니다"
- 대문자/숫자만 들어가는지 확인 (`O`/`0`, `I`/`1` 헷갈리기 쉬움).
- 대시보드 카드를 새로고침하면 새 코드가 나옴 (이전 코드는 무효).
- 형식: `XXX-XXX` — 하이픈 있어도 없어도 OK (CLI 가 정규화).

## Claude Code 설치
- **모든 OS**: `npm install -g @anthropic-ai/claude-code`
- **macOS Homebrew**: `brew install --cask claude-code`
- 공식: https://docs.claude.com/claude-code/quickstart

## Codex CLI 설치
- `npm install -g @openai/codex`
- 설치 후: `codex auth login` 으로 OpenAI API 키 설정.
- 공식: https://github.com/openai/codex

## 자료 다운로드가 0바이트 / 네트워크 실패
- 다른 사이트가 열리는지 확인.
- VPN 켜져 있으면 끄고 재시도.
- 회사 방화벽이 camp.scaila.kr 막을 수 있음 — 운영팀 문의.
- `npx @scaila/camp-cli init` 다시 (멱등 — 누락분만 채움).

## "이대로 제출할까요?" 에서 뭘 확인해야 하나
- 미리보기에 회사/팀/이름이 맞는지.
- `outputs/<file>.md` 가 본인이 작성한 최신본인지.
- 완료 기준(acceptanceCriteria)을 다 충족했는지.

## Claude Code / Codex 가 멈춘 것 같을 때
- Ctrl+C 로 중지.
- `npx @scaila/camp-cli status` 직접 실행해서 상태 확인.
- `npx @scaila/camp-cli doctor` 로 환경 점검.

## 그래도 막히면
운영팀에 다음 정보와 함께 문의:
- OS / 버전 (예: macOS 14, Windows 11)
- `npx @scaila/camp-cli doctor` 출력 전체
- 실행한 명령어와 에러 메시지 전문
