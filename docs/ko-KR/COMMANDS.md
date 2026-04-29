# GSD 명령어 레퍼런스

> 전체 명령어 문법, 플래그, 옵션, 사용 예시를 다룹니다. 기능 상세 설명은 [Feature Reference](FEATURES.md)를 참고하세요. 워크플로우 안내는 [User Guide](USER-GUIDE.md)를 참고하세요.

---

## 명령어 문법

- **Claude Code / Gemini / Copilot:** `/gsd-command-name [args]`
- **OpenCode / Kilo:** `/gsd-command-name [args]`
- **Codex:** `$gsd-command-name [args]`

---

## 핵심 워크플로우 명령어

### `/gsd-new-project`

심층 컨텍스트 수집을 통해 새 프로젝트를 초기화합니다.

| 플래그 | 설명 |
|--------|------|
| `--auto @file.md` | 문서에서 자동으로 정보를 추출하고 대화형 질문을 건너뜁니다 |

**사전 조건:** `.planning/PROJECT.md`가 존재하지 않아야 합니다.
**생성 파일:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`, `research/`, `CLAUDE.md`

```bash
/gsd-new-project                    # 대화형 모드
/gsd-new-project --auto @prd.md     # PRD에서 자동 추출
```

---

### `/gsd-new-workspace`

격리된 워크스페이스를 생성합니다. 저장소 복사본과 독립적인 `.planning/` 디렉터리가 포함됩니다.

| 플래그 | 설명 |
|--------|------|
| `--name <name>` | 워크스페이스 이름 (필수) |
| `--repos repo1,repo2` | 쉼표로 구분된 저장소 경로 또는 이름 |
| `--path /target` | 대상 디렉터리 (기본값: `~/gsd-workspaces/<name>`) |
| `--strategy worktree\|clone` | 복사 전략 (기본값: `worktree`) |
| `--branch <name>` | 체크아웃할 브랜치 (기본값: `workspace/<name>`) |
| `--auto` | 대화형 질문을 건너뜁니다 |

**사용 사례.**
- 멀티 저장소: 격리된 GSD 상태로 일부 저장소만 작업합니다.
- 기능 격리: `--repos .`는 현재 저장소의 worktree를 생성합니다.

**생성 파일:** `WORKSPACE.md`, `.planning/`, 저장소 복사본 (worktree 또는 clone)

```bash
/gsd-new-workspace --name feature-b --repos hr-ui,ZeymoAPI
/gsd-new-workspace --name feature-b --repos . --strategy worktree  # 동일 저장소 격리
/gsd-new-workspace --name spike --repos api,web --strategy clone   # 전체 클론
```

---

### `/gsd-list-workspaces`

활성 GSD 워크스페이스와 상태를 목록으로 표시합니다.

**스캔 위치:** `~/gsd-workspaces/`에서 `WORKSPACE.md` 매니페스트를 탐색합니다.
**표시 항목:** 이름, 저장소 수, 전략, GSD 프로젝트 상태

```bash
/gsd-list-workspaces
```

---

### `/gsd-remove-workspace`

워크스페이스를 제거하고 git worktree를 정리합니다.

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `<name>` | 예 | 제거할 워크스페이스 이름 |

**안전 장치:** 저장소에 커밋되지 않은 변경사항이 있으면 제거를 거부합니다. 이름 확인이 필요합니다.

```bash
/gsd-remove-workspace feature-b
```

---

### `/gsd-discuss-phase`

계획 수립 전에 구현 결정사항을 캡처합니다.

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `N` | 아니오 | 페이즈 번호 (기본값: 현재 페이즈) |

| 플래그 | 설명 |
|--------|------|
| `--auto` | 모든 질문에 추천 기본값을 자동으로 선택합니다 |
| `--batch` | 질문을 하나씩 처리하는 대신 일괄 입력 방식으로 그룹화합니다 |
| `--analyze` | 토론 중 트레이드오프 분석을 추가합니다 |
| `--chain` | discuss → plan → execute를 하나의 플로우로 자동 체인합니다 (v1.31) |
| `--power` | 준비된 답변 파일에서 일괄 입력으로 질문에 답변합니다 (v1.32) |

**사전 조건:** `.planning/ROADMAP.md`가 존재해야 합니다.
**생성 파일:** `{phase}-CONTEXT.md`, `{phase}-DISCUSSION-LOG.md` (감사 추적)

```bash
/gsd-discuss-phase 1                # 페이즈 1 대화형 토론
/gsd-discuss-phase 3 --auto         # 페이즈 3 기본값 자동 선택
/gsd-discuss-phase --batch          # 현재 페이즈 일괄 모드
/gsd-discuss-phase 2 --analyze      # 트레이드오프 분석 포함 토론
```

### `/gsd-plan-phase`

페이즈를 조사하고 계획하며 검증합니다.

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `N` | 아니오 | 페이즈 번호 (기본값: 다음 미계획 페이즈) |

| 플래그 | 설명 |
|--------|------|
| `--auto` | 대화형 확인을 건너뜁니다 |
| `--research` | RESEARCH.md가 있어도 재조사를 강제합니다 |
| `--skip-research` | 도메인 조사 단계를 건너뜁니다 |
| `--gaps` | 갭 보완 모드 (VERIFICATION.md를 읽고 조사를 건너뜁니다) |
| `--skip-verify` | 계획 검증 루프를 건너뜁니다 |
| `--prd <file>` | discuss-phase 대신 PRD 파일을 컨텍스트로 사용합니다 |
| `--reviews` | REVIEWS.md의 교차 AI 리뷰 피드백으로 재계획합니다 |

**사전 조건:** `.planning/ROADMAP.md`가 존재해야 합니다.
**생성 파일:** `{phase}-RESEARCH.md`, `{phase}-{N}-PLAN.md`, `{phase}-VALIDATION.md`

```bash
/gsd-plan-phase 1                   # 페이즈 1 조사 + 계획 + 검증
/gsd-plan-phase 3 --skip-research   # 조사 없이 계획 (익숙한 도메인)
/gsd-plan-phase --auto              # 비대화형 계획 수립
```

---

### `/gsd-execute-phase`

페이즈의 모든 계획을 웨이브 기반 병렬화로 실행하거나 특정 웨이브만 실행합니다.

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `N` | **예** | 실행할 페이즈 번호 |
| `--wave N` | 아니오 | 페이즈 내 Wave `N`만 실행합니다 |

**사전 조건:** 페이즈에 PLAN.md 파일이 있어야 합니다.
**생성 파일:** 계획별 `{phase}-{N}-SUMMARY.md`, git 커밋, 페이즈가 완전히 완료되면 `{phase}-VERIFICATION.md`

```bash
/gsd-execute-phase 1                # 페이즈 1 실행
/gsd-execute-phase 1 --wave 2       # Wave 2만 실행
```

---

### `/gsd-verify-work`

자동 진단을 포함한 사용자 인수 테스트(UAT)를 수행합니다.

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `N` | 아니오 | 페이즈 번호 (기본값: 마지막 실행된 페이즈) |

**사전 조건:** 페이즈가 실행되어 있어야 합니다.
**생성 파일:** `{phase}-UAT.md`, 문제 발견 시 수정 계획

```bash
/gsd-verify-work 1                  # 페이즈 1 UAT
```

### `/gsd-complete-milestone`

마일스톤을 아카이브하고 릴리스 태그를 생성합니다.

**사전 조건:** 마일스톤 감사 완료 권장
**생성 파일:** `MILESTONES.md` 항목, git 태그

```bash
/gsd-complete-milestone
```

### `/gsd-new-milestone`

다음 버전 사이클을 시작합니다.

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `name` | 아니오 | 마일스톤 이름 |
| `--reset-phase-numbers` | 아니오 | 새 마일스톤을 Phase 1부터 시작하고 로드맵 작업 전에 기존 페이즈 디렉터리를 아카이브합니다 |

**사전 조건:** 이전 마일스톤이 완료되어 있어야 합니다.
**생성 파일:** 업데이트된 `PROJECT.md`, 새 `REQUIREMENTS.md`, 새 `ROADMAP.md`

```bash
/gsd-new-milestone                  # 대화형 모드
/gsd-new-milestone "v2.0 Mobile"    # 이름이 지정된 마일스톤
/gsd-new-milestone --reset-phase-numbers "v2.0 Mobile"  # 마일스톤 번호를 1부터 재시작
```

---

## 페이즈 관리 명령어

### `/gsd-add-phase`

로드맵에 새 페이즈를 추가합니다.

```bash
/gsd-add-phase                      # 대화형 — 페이즈를 설명합니다
```

### `/gsd-insert-phase`

소수점 번호 체계를 사용하여 페이즈 사이에 긴급 작업을 삽입합니다.

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `N` | 아니오 | 이 페이즈 번호 다음에 삽입합니다 |

```bash
/gsd-insert-phase 3                 # 페이즈 3과 4 사이에 삽입 → 3.1 생성
```

### `/gsd-remove-phase`

미래 페이즈를 제거하고 이후 페이즈 번호를 재정렬합니다.

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `N` | 아니오 | 제거할 페이즈 번호 |

```bash
/gsd-remove-phase 7                 # 페이즈 7 제거, 8→7, 9→8 등으로 재번호
```

### `/gsd-research-phase`

심층 에코시스템 조사만 수행합니다 (독립 실행 — 일반적으로 `/gsd-plan-phase`를 사용하세요).

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `N` | 아니오 | 페이즈 번호 |

```bash
/gsd-research-phase 4               # 페이즈 4 도메인 조사
```

### `/gsd-validate-phase`

Nyquist 검증 갭을 소급하여 감사하고 보완합니다.

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `N` | 아니오 | 페이즈 번호 |

```bash
/gsd-validate-phase 2               # 페이즈 2 테스트 커버리지 감사
```

---

## 탐색 명령어

### `/gsd-progress`

상태와 다음 단계를 표시합니다.

```bash
/gsd-progress                       # "지금 어디 있나? 다음은 무엇인가?"
```

### `/gsd-resume-work`

마지막 세션의 전체 컨텍스트를 복원합니다.

```bash
/gsd-resume-work                    # 컨텍스트 초기화 또는 새 세션 후 실행
```

### `/gsd-pause-work`

페이즈 중간에 중단할 때 컨텍스트 핸드오프를 저장합니다.

```bash
/gsd-pause-work                     # continue-here.md 생성
```

### `/gsd-help`

모든 명령어와 사용 가이드를 표시합니다.

```bash
/gsd-help                           # 빠른 레퍼런스
```

---

## 유틸리티 명령어

### `/gsd-quick`

GSD 보증을 갖춘 임시 작업을 실행합니다.

| 플래그 | 설명 |
|--------|------|
| `--full` | 계획 검사 (2회 반복) + 실행 후 검증 활성화 |
| `--discuss` | 경량 사전 계획 토론 |
| `--research` | 계획 전 집중 조사자 스폰 |

플래그는 조합하여 사용할 수 있습니다.

```bash
/gsd-quick                          # 기본 빠른 작업
/gsd-quick --discuss --research     # 토론 + 조사 + 계획
/gsd-quick --full                   # 계획 검사 및 검증 포함
/gsd-quick --discuss --research --full  # 모든 선택적 단계 포함
```

### `/gsd-add-todo`

나중을 위한 아이디어나 작업을 캡처합니다.

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `description` | 아니오 | 할 일 설명 |

```bash
/gsd-add-todo "Consider adding dark mode support"
```

### `/gsd-check-todos`

보류 중인 할 일 목록을 표시하고 작업할 항목을 선택합니다.

```bash
/gsd-check-todos
```

### `/gsd-profile-user`

Claude Code 세션 분석을 통해 8개 차원(커뮤니케이션 스타일, 의사결정 패턴, 디버깅 접근 방식, UX 선호도, 벤더 선택, 불만 유발 요인, 학습 스타일, 설명 깊이)으로 개발자 행동 프로필을 생성합니다. Claude의 응답을 개인화하는 아티팩트를 생성합니다.

| 플래그 | 설명 |
|--------|------|
| `--questionnaire` | 세션 분석 대신 대화형 설문지를 사용합니다 |
| `--refresh` | 세션을 재분석하고 프로필을 재생성합니다 |

**생성 아티팩트.**
- `USER-PROFILE.md` — 전체 행동 프로필
- `/gsd-dev-preferences` 명령어 — 모든 세션에서 선호도를 로드합니다
- `CLAUDE.md` 프로필 섹션 — Claude Code에 의해 자동으로 인식됩니다

```bash
/gsd-profile-user                   # 세션 분석 및 프로필 구축
/gsd-profile-user --questionnaire   # 대화형 설문지 대체 방법
/gsd-profile-user --refresh         # 새로운 분석으로 재생성
```

## 진단 명령어

## 워크스트림 관리

### `/gsd-workstreams`

마일스톤의 서로 다른 영역에 대한 동시 작업을 위한 병렬 워크스트림을 관리합니다.

**서브커맨드.**

| 서브커맨드 | 설명 |
|------------|------|
| `list` | 상태와 함께 모든 워크스트림 목록 (서브커맨드 없을 경우 기본값) |
| `create <name>` | 새 워크스트림 생성 |
| `status <name>` | 특정 워크스트림의 상세 상태 |
| `switch <name>` | 활성 워크스트림 설정 |
| `progress` | 모든 워크스트림의 진행 상황 요약 |
| `complete <name>` | 완료된 워크스트림 아카이브 |
| `resume <name>` | 워크스트림의 작업 재개 |

**사전 조건:** 활성 GSD 프로젝트
**생성 파일:** `.planning/` 하위의 워크스트림 디렉터리, 워크스트림별 상태 추적

```bash
/gsd-workstreams                    # 모든 워크스트림 목록
/gsd-workstreams create backend-api # 새 워크스트림 생성
/gsd-workstreams switch backend-api # 활성 워크스트림 설정
/gsd-workstreams status backend-api # 상세 상태 확인
/gsd-workstreams progress           # 교차 워크스트림 진행 상황 개요
/gsd-workstreams complete backend-api  # 완료된 워크스트림 아카이브
/gsd-workstreams resume backend-api    # 워크스트림 작업 재개
```

---

## 설정 명령어

### `/gsd-settings`

워크플로우 토글 및 모델 프로필의 대화형 설정을 합니다.

```bash
/gsd-settings                       # 대화형 설정
```

### `/gsd-set-profile`

프로필을 빠르게 전환합니다.

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `profile` | **예** | `quality`, `balanced`, `budget`, 또는 `inherit` |

```bash
/gsd-set-profile budget             # 예산 프로필로 전환
/gsd-set-profile quality            # 품질 프로필로 전환
```

---

## 브라운필드 명령어

## 업데이트 명령어

### `/gsd-update`

변경 로그 미리보기와 함께 GSD를 업데이트합니다.

```bash
/gsd-update                         # 업데이트 확인 및 설치
```

### `/gsd-reapply-patches`

GSD 업데이트 후 로컬 수정사항을 복원합니다.

```bash
/gsd-reapply-patches                # 로컬 변경사항 병합
```

---

## 빠른 인라인 명령어

## 코드 품질 명령어

### `/gsd-review`

외부 AI CLI를 통한 페이즈 계획의 교차 AI 동료 리뷰를 수행합니다.

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `--phase N` | **예** | 리뷰할 페이즈 번호 |

| 플래그 | 설명 |
|--------|------|
| `--gemini` | Gemini CLI 리뷰 포함 |
| `--claude` | Claude CLI 리뷰 포함 (별도 세션) |
| `--codex` | Codex CLI 리뷰 포함 |
| `--coderabbit` | CodeRabbit 리뷰 포함 |
| `--opencode` | OpenCode 리뷰 포함 (GitHub Copilot 경유) |
| `--qwen` | Qwen Code 리뷰 포함 (Alibaba Qwen 모델) |
| `--cursor` | Cursor 에이전트 리뷰 포함 |
| `--all` | 사용 가능한 모든 CLI 포함 |

**생성 파일:** `{phase}-REVIEWS.md` — `/gsd-plan-phase --reviews`에서 사용 가능

```bash
/gsd-review --phase 3 --all
/gsd-review --phase 2 --gemini
```

---

### `/gsd-pr-branch`

`.planning/` 커밋을 필터링한 깔끔한 PR 브랜치를 생성합니다.

| 인수 | 필수 여부 | 설명 |
|------|----------|------|
| `target branch` | 아니오 | 기본 브랜치 (기본값: `main`) |

**목적:** 리뷰어에게 GSD 계획 아티팩트가 아닌 코드 변경사항만 표시합니다.

```bash
/gsd-pr-branch                     # main을 기준으로 필터링
/gsd-pr-branch develop             # develop을 기준으로 필터링
```

## 백로그 및 스레드 명령어

## 커뮤니티 명령어

### `/gsd-join-discord`

Discord 커뮤니티 초대 링크를 엽니다.

```bash
/gsd-join-discord
```
