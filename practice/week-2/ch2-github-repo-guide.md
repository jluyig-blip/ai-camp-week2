# Ch2 GitHub 제출 가이드 — 계정명 + 개인 레포지토리 URL

> 2주차 과제는 LMS 입력칸만 채우는 것으로 끝내지 않습니다. 본인 작업폴더를 GitHub 레포지토리로 남기고, LMS에 **GitHub 계정명**과 **레포지토리 URL**을 함께 제출합니다.

## 제출해야 하는 것

| 항목 | 예시 | 필수 |
|---|---|---|
| GitHub 계정명 | `jinkyu-lee` | 필수 |
| 개인 레포지토리 URL | `https://github.com/jinkyu-lee/ai-camp-week2` | 필수 |
| 과제 본문 | 산출물 한 줄, 입력 예시, 골든 출력, 첫 초안, 격차 분석, 3주차 제약 조건 | 필수 |

## Step 1. GitHub 계정 만들기

1. https://github.com 에 접속합니다.
2. `Sign up`으로 계정을 만듭니다.
3. 이메일 인증을 완료합니다.
4. 계정명(username)을 메모합니다.

이미 계정이 있으면 새로 만들 필요 없습니다.

## Step 2. 개인 레포지토리 만들기

GitHub 오른쪽 위 `+` → `New repository`를 누릅니다.

권장값:

```text
Repository name: ai-camp-week2
Description: The Camp Week 2 context engineering assignment
Visibility: Public
Initialize with README: 체크 가능
```

회사 자료나 민감한 데이터가 들어간다면 `Private`로 만들고 강사에게 접근 권한을 줘야 합니다. 초보자는 개인정보를 익명화한 뒤 `Public`으로 만드는 쪽이 가장 단순합니다.

## Step 3. Claude Code에게 README와 제출용 파일 정리 시키기

Claude Code에서 작업폴더를 연 뒤 아래처럼 지시합니다.

```text
현재 폴더는 The Camp 2주차 과제 폴더야.

plan.md, golden/input-example.md, golden/output-example.md,
outputs/draft-1.md, outputs/gap-analysis.md, outputs/workflow-map.md가 있으면 읽어줘.

GitHub에 올릴 README.md를 만들어줘.
README에는 아래 내용을 포함해줘.
1. 내가 만들 자동화 MVP 한 줄
2. AI가 맡을 일과 사람이 최종 확인할 일
3. 사용한 입력 예시와 이상적인 출력 예시 요약
4. 첫 초안과 골든 출력의 차이
5. 3주차에 적용할 제약 조건 후보
6. 민감정보는 익명화했다는 확인

.gitignore도 만들어서 node_modules, .env, .DS_Store, 개인 토큰 파일은 제외해줘.
```

## Step 4. 로컬 폴더를 GitHub에 올리기

터미널에서 작업폴더로 이동한 뒤 실행합니다.

```bash
cd ai-camp-week2
git init
git add README.md plan.md golden outputs CLAUDE.md .gitignore
git commit -m "week2 context setup"
git branch -M main
git remote add origin https://github.com/<본인계정명>/ai-camp-week2.git
git push -u origin main
```

`<본인계정명>`은 실제 GitHub 계정명으로 바꿉니다.

처음 push할 때 로그인을 요구하면 GitHub 브라우저 로그인 또는 Personal Access Token 안내가 나올 수 있습니다. 수업 중 여기서 막히면 파일은 LMS에 먼저 제출하고, 레포 URL은 만든 뒤 보강 제출합니다.

## Step 5. LMS에 제출하기

camp.scaila.kr → `과제` → `2주차 과제`를 열고 아래를 채웁니다.

```text
GitHub 계정명: 본인 username
개인 GitHub 레포지토리 URL: https://github.com/<본인계정명>/ai-camp-week2
```

나머지 과제 본문 필드에는 `outputs/gap-analysis.md`와 관련 파일 내용을 붙여넣습니다.

## Claude Code에게 한 번에 시키는 프롬프트

```text
The Camp 2주차 과제 제출을 도와줘.

목표:
- 내 작업폴더를 GitHub 레포지토리로 정리한다.
- LMS에 제출할 GitHub 계정명과 레포지토리 URL을 확인한다.
- 민감정보가 들어간 파일은 올리지 않는다.

순서:
1. 현재 폴더의 plan.md, golden/, outputs/, CLAUDE.md를 읽고 빠진 파일을 알려줘.
2. README.md와 .gitignore를 만들어줘.
3. GitHub에 올려도 되는 파일과 올리면 안 되는 파일을 구분해줘.
4. 내가 GitHub에서 만든 레포 URL을 주면, 필요한 git 명령을 한 줄씩 설명해줘.
5. 마지막에 LMS 제출칸에 넣을 값을 정리해줘.

주의:
- git push는 내가 레포 URL을 확인한 뒤에만 안내해줘.
- .env, 토큰, 실제 고객 연락처, 내부 기밀은 절대 포함하지 마.
```

## 자주 막히는 지점

### `git: command not found`

Mac은 Xcode Command Line Tools 설치 창이 뜰 수 있습니다. Windows는 Git for Windows 설치가 필요합니다.

```bash
git --version
```

### `remote origin already exists`

이미 remote가 연결된 상태입니다.

```bash
git remote -v
```

잘못 연결했다면 강사에게 확인받고 수정합니다.

### `Authentication failed`

GitHub 비밀번호로는 push가 안 될 수 있습니다. 브라우저 로그인 또는 토큰 인증이 필요합니다. 수업 중 시간이 부족하면 레포를 먼저 만들고 LMS에는 URL을 제출한 뒤, 파일 업로드는 보강합니다.
