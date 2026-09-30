/**
 * 아주 작은 마크다운 표시기 — ⛔ 외부 라이브러리 0. 사용 설명서 하나를 그리는 데 필요한 만큼만 안다.
 *   지원: # ## ### 제목 · - / 1. 목록 · **굵게** · `코드` · | 표 | · 빈 줄 단락.
 *   제목마다 id 를 붙여 목차(TOC)에서 점프한다.
 */
import { type ReactNode } from 'react';
import { Figure } from './figures/Figure';
import { Demo } from './demos/Demo';
import { FIGURE_IDS, DEMO_IDS, type FigureId, type DemoId } from './rich';

function slug(s: string): string {
    return 'sec-' + s.trim().replace(/\s+/g, '-').replace(/[^\w가-힣-]/g, '');
}

/** **굵게** · `코드` 만 처리한 인라인 조각 */
function inline(text: string): ReactNode[] {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((s) => s !== '');
    return parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="font-semibold text-text">{p.slice(2, -2)}</strong>;
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="px-1 py-0.5 rounded bg-panel2 border border-line text-[12px]">{p.slice(1, -1)}</code>;
        return <span key={i}>{p}</span>;
    });
}

export interface Heading { id: string; level: number; text: string; }

/** 문서에서 제목만 뽑아 목차를 만든다 */
export function tocOf(md: string): Heading[] {
    const out: Heading[] = [];
    for (const line of md.split('\n')) {
        const m = /^(#{1,3})\s+(.*)$/.exec(line);
        if (m) out.push({ id: slug(m[2]), level: m[1].length, text: m[2].trim() });
    }
    return out;
}

export function Markdown({ md }: { md: string }) {
    const lines = md.split('\n');
    const blocks: ReactNode[] = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
        const line = lines[i];

        // 빈 줄
        if (line.trim() === '') { i += 1; continue; }

        // HTML 주석 줄 — <!-- figure:ID --> · <!-- demo:ID --> 는 그림/움직임으로. 그 밖은 건너뛴다(화면에 안 새게)
        if (line.trim().startsWith('<!--')) {
            const m = /^<!--\s*(figure|demo):([\w-]+)\s*-->$/.exec(line.trim());
            if (m) {
                const [, kind, id] = m;
                if (kind === 'figure' && (FIGURE_IDS as string[]).includes(id)) {
                    blocks.push(<Figure key={key++} id={id as FigureId} className="my-3 rounded-md border border-line bg-panel2 p-2" />);
                } else if (kind === 'demo' && (DEMO_IDS as string[]).includes(id)) {
                    blocks.push(<Demo key={key++} id={id as DemoId} autoplay className="my-3" />);
                }
                // 목록에 없는 id 는 무시
            }
            i += 1; continue;
        }

        // 제목
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        if (h) {
            const lvl = h[1].length, text = h[2].trim(), id = slug(text);
            const cls = lvl === 1 ? 'text-[16px] font-semibold mt-4 mb-2'
                : lvl === 2 ? 'text-[14px] font-semibold mt-4 mb-1.5'
                    : 'text-[13px] font-semibold mt-3 mb-1';
            blocks.push(<h3 key={key++} id={id} className={`${cls} scroll-mt-2`}>{inline(text)}</h3>);
            i += 1; continue;
        }

        // 표 — 헤더줄 다음이 구분줄(---) 이면 표로 본다
        if (line.includes('|') && i + 1 < lines.length && /^[\s|:-]+$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
            const cells = (r: string) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
            const header = cells(line);
            i += 2;
            const rows: string[][] = [];
            while (i < lines.length && lines[i].includes('|')) { rows.push(cells(lines[i])); i += 1; }
            blocks.push(
                <table key={key++} className="my-2 w-full border-collapse text-[12px]">
                    <thead><tr>{header.map((c, ci) => <th key={ci} className="border border-line px-2 py-1 bg-panel2 text-left font-medium">{inline(c)}</th>)}</tr></thead>
                    <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border border-line px-2 py-1 align-top">{inline(c)}</td>)}</tr>)}</tbody>
                </table>,
            );
            continue;
        }

        // 목록 (- 또는 1.)
        if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
            const items: string[] = [];
            const ordered = /^\s*\d+\.\s+/.test(line);
            while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
                i += 1;
            }
            const inner = items.map((it, ii) => <li key={ii} className="leading-relaxed">{inline(it)}</li>);
            blocks.push(ordered
                ? <ol key={key++} className="list-decimal ml-5 my-2 space-y-1 text-[13px] text-muted">{inner}</ol>
                : <ul key={key++} className="list-disc ml-5 my-2 space-y-1 text-[13px] text-muted">{inner}</ul>);
            continue;
        }

        // 단락 — 빈 줄 전까지 모은다
        const para: string[] = [];
        while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,3})\s+/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
            para.push(lines[i]); i += 1;
        }
        blocks.push(<p key={key++} className="my-2 text-[13px] leading-relaxed">{inline(para.join(' '))}</p>);
    }

    return <div className="markdown-body">{blocks}</div>;
}
