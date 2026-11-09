import { describe, it, expect } from 'vitest';
import { pruneBlankLeaves } from './Workbench';
import { emptyWorkspace, tabs, leaf, flatten } from '../pane-ui-system';

describe('pruneBlankLeaves', () => {
    it('빈 새 탭은 버리고 다른 탭은 남긴다', () => {
        const ws = { ...emptyWorkspace(), center: tabs([leaf('app.blank', '새 탭'), leaf('x.y', '글'), leaf('app.blank', '새 탭')]) };
        expect(flatten(pruneBlankLeaves(ws).center).map((l) => l.viewId)).toEqual(['x.y']);
    });
    it('빈 새 탭만 있으면 하나만 남긴다', () => {
        const ws = { ...emptyWorkspace(), center: tabs([leaf('app.blank', '새 탭'), leaf('app.blank', '새 탭'), leaf('app.blank', '새 탭')]) };
        expect(flatten(pruneBlankLeaves(ws).center)).toHaveLength(1);
    });
});
