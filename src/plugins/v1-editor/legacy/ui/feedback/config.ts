/**
 * 의견 창구 설정 — 외부 서비스 없이 GitHub 안에서만 돈다.
 *  앱 → workflow_dispatch(공개 토큰: Actions 쓰기만) → 비공개 접수 저장소의 intake.yml → 이슈.
 *  토큰이 비어 있거나 보내기가 실패하면 「파일로 내려받기」로 떨어진다(서버 0 으로도 창구는 산다).
 *  후임 절차: docs/의견 창구 인수인계.md
 */

/** 접수 저장소 ("조직/저장소"). 비공개여야 한다 — 캡처에 실명이 보일 수 있다 */
export const FEEDBACK_REPO = '2026-gne-dev-task-force-team/school-shiftgrid-feedback';

/** 접수 워크플로 파일 이름 (접수 저장소의 .github/workflows/ 안) */
export const FEEDBACK_WORKFLOW = 'intake.yml';

/**
 * 공개 토큰 — Pages 배포가 빌드할 때 저장소 Secret(FEEDBACK_DISPATCH_TOKEN) 에서 넣는다.
 * ⭐ 「워크플로 실행」 권한만 있는 토큰이라 공개돼도 읽히는 것이 없다. 빈 값이면 온라인 길이 꺼진다.
 */
export const FEEDBACK_TOKEN: string = (import.meta.env?.VITE_FEEDBACK_TOKEN as string | undefined) ?? '';

/** GitHub 계정이 있는 사람이 직접 올리는 곳 (안내문에만 쓴다) */
export const ISSUES_URL = 'https://github.com/2026-gne-dev-task-force-team/school-shiftgrid-scheduler/issues';
