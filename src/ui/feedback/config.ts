/**
 * 의견 창구 설정 — 중계(Cloudflare Worker) 주소 하나.
 *  비어 있거나 중계가 응답하지 않으면 앱은 「파일로 내려받기」로 떨어진다(서버 0 으로도 창구는 산다).
 *  후임이 중계를 새로 올리면 이 한 줄만 바꾼다 → docs/의견 창구 인수인계.md
 */
export const FEEDBACK_URL: string = (import.meta.env?.VITE_FEEDBACK_URL as string | undefined)
    ?? 'https://shiftgrid-feedback.2026-gne-dev-task-force-team.workers.dev';

/** 중계 없이도 이슈를 손으로 올릴 수 있는 곳 (GitHub 계정이 있는 사람용 — 안내문에만 쓴다) */
export const ISSUES_URL = 'https://github.com/2026-gne-dev-task-force-team/school-shiftgrid-scheduler/issues';
