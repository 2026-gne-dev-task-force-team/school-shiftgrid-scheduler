import { describe, it, expect } from 'vitest';
import { PLUGINS } from './plugins';
import { PLUGIN_LAYERS } from '../pane-ui-system/plugin';

describe('PLUGINS — 층 순으로 줄 서 있다', () => {
    it('모든 꾸러미가 층을 적었고, 순서가 platform → app → domain 이다', () => {
        const ranks = PLUGINS.map((p) => {
            const r = PLUGIN_LAYERS.indexOf(p.manifest.layer as never);
            expect(r, `${p.manifest.id} 에 manifest.layer 가 없다`).toBeGreaterThanOrEqual(0);
            return r;
        });
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    });
    it('코어(끌 수 없는) 꾸러미는 플랫폼 층이다', () => {
        for (const p of PLUGINS) if (p.manifest.core) expect(p.manifest.layer).toBe('platform');
    });
});
