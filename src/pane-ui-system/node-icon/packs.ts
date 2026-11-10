/**
 * 아이콘 묶음 등록소 — 플러그인이 contributes.iconPacks 로 내놓은 커스텀 아이콘이 모이는 자리.
 *   값 꼴: { id, name, icons: [{ id, name, keywords?, svg? | url? }] } — svg(문자열) 또는 url(이미지 주소) 중 하나.
 *   🔴 등록 때 소독한다(sanitizeSvg · safeImageUrl) — 못 쓰는 그림은 조용히 빼지 않고 경고를 남기고 뺀다.
 *   주인(owner)이 꺼지면 dispose 로 그 묶음이 빠진다(플러그인 끄기와 같은 회수 경로).
 */
import { useSyncExternalStore } from 'react';
import { safeImageUrl, sanitizeSvg } from './svg-sanitize';

export interface IconPackIcon { id: string; name: string; keywords?: string[]; svg?: string; url?: string }
export interface IconPackContribution { id: string; name: string; icons: IconPackIcon[] }
/** 등록된(소독된) 그림 — svg 는 소독된 문자열, url 은 통과한 주소 */
export interface ResolvedPackIcon { id: string; name: string; keywords: string[]; svg?: string; url?: string }
export interface ResolvedPack { id: string; name: string; owner: string; icons: ResolvedPackIcon[] }

const packs = new Map<string, ResolvedPack>();
let cache: ResolvedPack[] | null = null;
const listeners = new Set<() => void>();
const emit = () => { cache = null; for (const l of listeners) l(); };

export function addIconPack(owner: string, pack: IconPackContribution): { dispose(): void } {
    const icons: ResolvedPackIcon[] = [];
    for (const ic of pack.icons ?? []) {
        const svg = ic.svg != null ? sanitizeSvg(ic.svg) : null;
        const url = ic.url != null ? safeImageUrl(ic.url) : null;
        if (!ic.id || (!svg && !url)) { console.warn(`[icon-pack] "${pack.id}" 의 그림 "${ic.id}" 는 쓸 수 없어 뺀다(SVG·주소가 비었거나 거부됨)`); continue; }
        icons.push({ id: ic.id, name: ic.name || ic.id, keywords: ic.keywords ?? [], svg: svg ?? undefined, url: svg ? undefined : url ?? undefined });
    }
    const entry: ResolvedPack = { id: pack.id, name: pack.name, owner, icons };
    packs.set(pack.id, entry);
    emit();
    return { dispose() { if (packs.get(pack.id) === entry) { packs.delete(pack.id); emit(); } } };
}

export function listIconPacks(): ResolvedPack[] {
    if (!cache) cache = [...packs.values()];
    return cache;
}
export function resolvePackIcon(pack: string, id: string): ResolvedPackIcon | undefined {
    return packs.get(pack)?.icons.find((i) => i.id === id);
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useIconPacks(): ResolvedPack[] { return useSyncExternalStore(subscribe, listIconPacks, listIconPacks); }
