/**
 * NodeIcon — 노드 제목 옆 아이콘을 그리는 부품 하나. 탐색기·탭 머리·제목·링크·미리보기 머리가 전부 이걸 쓴다.
 *   value: 저장 문자열(옛 이모지 포함) 또는 값 객체. 없으면 fallback(보통 그 타입의 기본 아이콘)을 그린다.
 *   size: 픽셀(기본 15). 이모지는 글자 크기로, 아이콘·그림은 정사각으로 그린다.
 *   🔴 커스텀 그림이 등록소에 없으면(그 플러그인이 꺼졌다) fallback 으로 돌아간다 — 빈칸으로 두지 않는다.
 */
import { useId, type ReactNode } from 'react';
import { Icon } from '../primitives/Icon';
import { colorClass, parseNodeIcon, type NodeIconValue } from './model';
import { resolvePackIcon, useIconPacks } from './packs';
import { sanitizeSvg } from './svg-sanitize';

export function NodeIcon({ value, size = 15, fallback = null, className = '' }: {
    value: string | NodeIconValue | null | undefined;
    size?: number;
    fallback?: ReactNode;
    className?: string;
}) {
    const uid = useId();
    useIconPacks();   // 묶음이 늦게 꽂히거나 빠지면 다시 그린다
    const v = parseNodeIcon(value);
    if (!v) return <>{fallback}</>;
    const box = { width: size, height: size };
    if (v.kind === 'emoji') {
        return <span data-node-icon="emoji" className={`shrink-0 inline-grid place-items-center text-center leading-none select-none ${className}`} style={{ ...box, fontSize: Math.round(size * 0.9) }} aria-hidden="true">{v.value}</span>;
    }
    if (v.kind === 'icon') {
        return <Icon name={v.name} size={size} className={`shrink-0 ${colorClass(v.color)} ${className}`} />;
    }
    const ic = resolvePackIcon(v.pack, v.id);
    if (!ic) return <>{fallback}</>;
    if (ic.svg) {
        // 등록 때 소독했지만 그리기 직전에 한 번 더 — 소독은 멱등이라 값이 같다
        const html = sanitizeSvg(ic.svg, `${v.pack}-${v.id}-${uid}`);
        if (!html) return <>{fallback}</>;
        return <span data-node-icon="custom" className={`shrink-0 inline-block ${className}`} style={box} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return <img data-node-icon="custom" src={ic.url} alt="" width={size} height={size} className={`shrink-0 object-contain ${className}`} draggable={false} />;
}
