/**
 * 노드 아이콘 값 — 제목 옆에 박는 그림 하나. 세 종류 중 하나다.
 *   emoji  : 유니코드 이모지 글자
 *   icon   : 앱 기본 아이콘 세트(Icon) 이름 + 고른 색(선택)
 *   custom : 플러그인이 내놓은 아이콘 묶음(pack)의 한 그림(id)
 *
 * 🔑 저장은 **문자열 하나**다(노드 icon · 탭 glyph · 칸 icon 이 원래 문자열이라 저장 꼴·계약을 안 바꾼다).
 *    emoji → 글자 그대로(= 옛 저장값 그대로 읽힌다) · icon → `icon:이름[:색]` · custom → `custom:묶음:id`.
 *    ⛔ 옛 값을 고쳐 쓰지 않는다 — 읽을 때 emoji 로 이어받기만 한다(parseNodeIcon).
 */
import type { IconName } from '../primitives/Icon';

export type NodeIconColor = 'accent' | 'ok' | 'warn' | 'bad' | 'purple' | 'pink' | 'teal' | 'muted';

export type NodeIconValue =
    | { kind: 'emoji'; value: string }
    | { kind: 'icon'; name: IconName; color?: NodeIconColor }
    | { kind: 'custom'; pack: string; id: string };

/** 고르기 창의 색 여덟(+기본). 클래스는 글자 그대로 적어야 타일윈드가 만든다. */
export const NODE_ICON_COLORS: { id: NodeIconColor; label: string; cls: string }[] = [
    { id: 'accent', label: '파랑', cls: 'text-accent' },
    { id: 'ok', label: '초록', cls: 'text-ok' },
    { id: 'warn', label: '노랑', cls: 'text-warn' },
    { id: 'bad', label: '빨강', cls: 'text-bad' },
    { id: 'purple', label: '보라', cls: 'text-ic-purple' },
    { id: 'pink', label: '분홍', cls: 'text-ic-pink' },
    { id: 'teal', label: '청록', cls: 'text-ic-teal' },
    { id: 'muted', label: '회색', cls: 'text-muted' },
];

export function colorClass(c: NodeIconColor | undefined): string {
    return NODE_ICON_COLORS.find((x) => x.id === c)?.cls ?? '';
}

const COLOR_IDS = new Set<string>(NODE_ICON_COLORS.map((c) => c.id));

/** 저장 문자열(또는 값)을 값으로 — 빈 값은 undefined. 접두사(icon:·custom:)가 아닌 문자열은 전부 emoji 로 이어받는다. */
export function parseNodeIcon(raw: string | NodeIconValue | null | undefined): NodeIconValue | undefined {
    if (raw == null) return undefined;
    if (typeof raw !== 'string') return raw;
    const s = raw.trim();
    if (!s) return undefined;
    if (s.startsWith('icon:')) {
        const [, name, color] = s.split(':');
        if (name) return { kind: 'icon', name: name as IconName, color: color && COLOR_IDS.has(color) ? (color as NodeIconColor) : undefined };
    }
    if (s.startsWith('custom:')) {
        const rest = s.slice('custom:'.length);
        const i = rest.indexOf(':');
        if (i > 0 && i < rest.length - 1) return { kind: 'custom', pack: rest.slice(0, i), id: rest.slice(i + 1) };
    }
    return { kind: 'emoji', value: s };
}

/** 값을 저장 문자열로 — emoji 는 글자 그대로. */
export function serializeNodeIcon(v: NodeIconValue | undefined): string | undefined {
    if (!v) return undefined;
    if (v.kind === 'emoji') return v.value || undefined;
    if (v.kind === 'icon') return v.color ? `icon:${v.name}:${v.color}` : `icon:${v.name}`;
    return `custom:${v.pack}:${v.id}`;
}
