/**
 * 🔴 subjects 인터페이스 모듈 — manifest.provides.subjects 와 짝. 속은 컬렉션 kit 로만(항목 ↔ Subject 변환만 여기서).
 */
import type { CollectionItem } from '../collection/contracts/collection';
import type { Subjects, Subject, SubjectKind } from './contracts/subjects';
import type { Disposable } from '../../pane-ui-system/plugin';
import { getKit } from './nodes';

const KINDS: readonly string[] = ['homeroom', 'subject', 'common'];

function toSubject(it: CollectionItem): Subject {
    const s: Subject = { id: it.id, listId: it.listId, name: it.name };
    const v = it.values;
    if (typeof v.short === 'string' && v.short !== '') s.short = v.short;
    if (typeof v.memo === 'string' && v.memo !== '') s.memo = v.memo;
    if (typeof v.f_kind === 'string' && KINDS.includes(v.f_kind)) s.kind = v.f_kind as SubjectKind;
    if (it.ext) s.ext = it.ext;
    return s;
}

export const subjectsApi: Subjects = {
    version: 1,
    lists: () => getKit()?.lists() ?? [],
    subjectsIn: (listId) => getKit()?.itemsIn(listId).map(toSubject) ?? [],
    subject: (id) => { const it = getKit()?.itemOf(id); return it ? toSubject(it) : undefined; },
    addSubject: (listId, input) => getKit()?.addItem(listId, { name: input.name, short: input.short ?? '', memo: input.memo ?? '' }) ?? '',
    updateSubject: (id, patch) => {
        const k = getKit();
        if (patch.name !== undefined) k?.setValue(id, 'name', patch.name);
        if (patch.short !== undefined) k?.setValue(id, 'short', patch.short);
        if (patch.memo !== undefined) k?.setValue(id, 'memo', patch.memo);
    },
    removeSubject: (id) => getKit()?.removeItem(id),
    moveSubject: (id, listId, index) => getKit()?.moveItem(id, listId, index),
    pasteSubjects: (listId, text) => getKit()?.pasteItems(listId, text) ?? [],
    onChange: (listener): Disposable => getKit()?.onChange(listener) ?? { dispose() { /* kit 없음 */ } },
};
