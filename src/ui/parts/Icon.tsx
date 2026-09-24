/** 인라인 SVG 아이콘 — ⛔ 아이콘 폰트·외부 CDN 0. 24 격자, currentColor 로 색을 물려받는다 */
import type { CSSProperties } from 'react';

export type IconName =
    | 'home' | 'table' | 'ban' | 'sparkles' | 'search' | 'edit' | 'layers' | 'printer'
    | 'undo' | 'redo' | 'save' | 'folder' | 'file' | 'plus' | 'trash' | 'check' | 'x'
    | 'info' | 'left' | 'warn' | 'copy' | 'pin' | 'gear' | 'download' | 'upload' | 'play' | 'dot';

const P: Record<IconName, string> = {
    home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    table: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16',
    ban: 'M5 5l14 14M12 3a9 9 0 100 18 9 9 0 000-18z',
    sparkles: 'M12 3l1.8 4.8L18.5 9.6 13.8 11.4 12 16.2 10.2 11.4 5.5 9.6 10.2 7.8zM19 15l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z',
    search: 'M11 4a7 7 0 105 12 7 7 0 000-14zM21 21l-4.5-4.5',
    edit: 'M4 4h7M4 4v16h16v-7M20.5 3.5a2.1 2.1 0 013 3L12 18l-4 1 1-4z',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
    printer: 'M6 9V3h12v6M6 18H4v-6h16v6h-2M8 14h8v6H8z',
    undo: 'M9 7L4 12l5 5M4 12h11a5 5 0 015 5',
    redo: 'M15 7l5 5-5 5M20 12H9a5 5 0 00-5 5',
    save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7',
    folder: 'M3 6h6l2 2h10v11H3z',
    file: 'M6 2h8l4 4v16H6zM14 2v4h4',
    plus: 'M12 5v14M5 12h14',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
    check: 'M4 12l5 5L20 6',
    x: 'M6 6l12 12M18 6L6 18',
    info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 10v7M12 7h.01',
    left: 'M15 5l-7 7 7 7',
    warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    pin: 'M12 3l4 4-1.5 1.5.5 5-3 3-3-3 .5-5L6 7z',
    gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2l-.4-2.6H10l-.4 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2l.4 2.6h4l.4-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
    download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
    upload: 'M12 21V9M7 14l5-5 5 5M4 3h16',
    play: 'M7 4l12 8-12 8z',
    dot: 'M12 10a2 2 0 100 4 2 2 0 000-4z',
};

export function Icon({ name, size = 18, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
            className={className} style={style} aria-hidden="true">
            <path d={P[name]} />
        </svg>
    );
}
