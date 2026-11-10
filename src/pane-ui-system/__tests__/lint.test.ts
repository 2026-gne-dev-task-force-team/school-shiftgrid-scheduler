/**
 * 린트 잠금 — `npm run lint`(oxlint)의 **오류**가 0 이어야 한다.
 *   🔴 지금 지키는 것: `react/forbid-elements` — 화면 코드에 맨 `<button> <input> <select> <textarea> <label>` 금지.
 *      공통 부품(src/pane-ui-system/primitives)만 쓴다 → 테마·모양을 한 곳에서 바꿀 수 있게.
 *   ⚠️ 예외 목록은 `.oxlintrc.json` overrides:
 *      ① primitives 자신 ② 업무 PC 영역(calendar·collection/fields·room-booking·rooms — 임시, 그쪽 갈기 뒤 푼다)
 *      ③ pane-test(개발용 시험대) ④ 구조상 날 요소가 남은 파일 목록(줄이기만 한다 — 새 파일을 여기 더하지 말 것)
 *   예외 파일 안에서 개수가 느는 것은 ratchet.test 의 bareButton·bareInput·bareTextarea·bareLabel 이 막는다.
 *   경고(warning)는 세지 않는다 — `--quiet`.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const BIN = join(ROOT, 'node_modules', 'oxlint', 'bin', 'oxlint');

describe('린트 잠금', () => {
    it('oxlint 오류 0 (날 요소 금지 포함)', () => {
        const r = spawnSync(process.execPath, [BIN, '--quiet', 'src'], { cwd: ROOT, encoding: 'utf-8' });
        expect(r.error).toBeUndefined();
        expect(r.status, `oxlint 가 오류를 냈다:\n${r.stdout}\n${r.stderr}`).toBe(0);
    }, 60_000);
});
