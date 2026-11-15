import { sniff } from '../../../shared/bundle/sniff.ts';
import { checkBundle, checkV1, hasBlocking, type Issue } from '../../../shared/check/index.ts';

export type CheckView =
    | { kind: 'unreadable'; message: string }
    | { kind: 'result'; format: 'v1' | 'bundle'; issues: Issue[]; blocking: boolean };

/** 파일 텍스트 → 결과 판 재료. 던지지 않는다. */
export function runCheck(text: string): CheckView {
    const s = sniff(text);
    if (s.kind === 'empty') return { kind: 'unreadable', message: '빈 파일입니다.' };
    if (s.kind === 'broken') return { kind: 'unreadable', message: `깨진 파일입니다 — ${s.reason}` };
    const issues = s.kind === 'v1' ? checkV1(s.raw) : checkBundle(s.bundle);
    return { kind: 'result', format: s.kind, issues, blocking: hasBlocking(issues) };
}

/** 파일 텍스트가 번들인가(「이 번들로 쓰기」 버튼을 보일지). */
export const isBundleText = (text: string): boolean => sniff(text).kind === 'bundle';
