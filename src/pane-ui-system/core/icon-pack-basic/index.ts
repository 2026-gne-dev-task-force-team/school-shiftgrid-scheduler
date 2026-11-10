/**
 * 「기본 아이콘 묶음」 꾸러미 — 화면도 명령도 없이 아이콘 묶음 하나만 contributes.iconPacks 로 내놓는다.
 *   그림은 24 격자 선 그림(stroke=currentColor) — 고른 자리의 글자색을 따른다. SVG 는 호스트가 그리기 전에 소독한다.
 */
import { definePlugin } from '../../plugin';
import { manifest } from './manifest';

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICON_PACK_BASIC_ICONS = [
    { id: 'heart', name: '하트', keywords: ['heart', '사랑', '좋아요'], svg: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>') },
    { id: 'star', name: '별', keywords: ['star', '즐겨찾기', '중요'], svg: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>') },
    { id: 'bookmark', name: '책갈피', keywords: ['bookmark', '저장'], svg: svg('<path d="M6 3h12v18l-6-4-6 4z"/>') },
    { id: 'flag', name: '깃발', keywords: ['flag', '목표', '표시'], svg: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>') },
    { id: 'bolt', name: '번개', keywords: ['bolt', 'lightning', '빠름', '전기'], svg: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>') },
    { id: 'moon', name: '달', keywords: ['moon', '밤'], svg: svg('<path d="M20 14.5A8 8 0 019.5 4 7 7 0 1020 14.5z"/>') },
    { id: 'cloud', name: '구름', keywords: ['cloud', '날씨'], svg: svg('<path d="M7 18a4 4 0 010-8 5.5 5.5 0 0110.6 1.4A3.3 3.3 0 0117 18z"/>') },
    { id: 'leaf', name: '잎', keywords: ['leaf', '자연', '식물'], svg: svg('<path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15zM5 19l8-8"/>') },
    { id: 'crown', name: '왕관', keywords: ['crown', '최고', '왕'], svg: svg('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>') },
    { id: 'house', name: '집', keywords: ['house', 'home', '홈'], svg: svg('<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>') },
    { id: 'chat', name: '말풍선', keywords: ['chat', 'comment', '대화', '댓글'], svg: svg('<path d="M4 5h16v11H10l-5 4v-4H4z"/>') },
    { id: 'gem', name: '보석', keywords: ['gem', 'diamond', '다이아'], svg: svg('<path d="M6 4h12l4 6-10 11L2 10zM2 10h20M9 4l-2 6 5 11 5-11-2-6"/>') },
];

export const iconPackBasicPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            iconPacks: [{ id: 'basic', name: '기본 아이콘', icons: ICON_PACK_BASIC_ICONS }],
        },
    },
});

export default iconPackBasicPlugin;
