/**
 * 시작 화면 공통 부품 — 「지금 보고 있는 것이 없을 때」(리본으로 처음 열기 · 보던 것이 휴지통으로 감)
 *   안내 문구 대신 띄우는 첫 화면. 「새로 만들기」 단추 하나 + 만들어 둔 목록(눌러서 열기).
 *   🔴 도메인을 모른다 — 아이콘·제목·목록·동작을 쓰는 쪽(플러그인)이 전부 넘긴다(창틀 재사용 규칙).
 *     데이터 길(만들기·열기·휴지통 거르기)은 넘기는 쪽의 노드 다리에 있고, 여기선 그려만 준다.
 */
import type { IconName } from './Icon';
import { Icon } from './Icon';
import { EmptyState } from './EmptyState';
import { josa } from './josa';

/** 목록 한 줄 — id(열 때 넘길 키)·name(보일 이름)·folder(든 폴더 이름, 맨 위면 없음). */
export interface StartItem {
    id: string; name: string; folder?: string | null;
    /** 그 노드의 사용자 이모지 — 있으면 아이콘 대신 그린다 */
    emoji?: string;
    /** 그 노드 타입 자신의 아이콘 — 없으면 화면 아이콘 */
    icon?: IconName;
}

export function StartScreen({
    icon, title, noun, description, newLabel, newHint, items, onNew, onOpen, disabled = false,
}: {
    icon: IconName;
    title: string;
    /** 이름씨(「페이지」「컬렉션」) — 안내·빈 상태 문구를 받침에 맞는 조사로 만든다(「컬렉션를」 금지). */
    noun: string;
    /** 안내 문구를 직접 쓸 때(없으면 noun 으로 만든다) */
    description?: string;
    newLabel: string;
    newHint?: string;
    items: StartItem[];
    onNew: () => void;
    onOpen: (id: string) => void;
    /** 다리가 아직 안 섰을 때(만들 수 없음) — 「새로 만들기」를 흐리게. */
    disabled?: boolean;
}) {
    return (
        <div className="h-full overflow-auto select-none">
            <div className="max-w-[560px] mx-auto px-6 py-10 flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-text">
                        <Icon name={icon} size={18} className="text-muted" />
                        <span className="text-[16px] font-medium">{title}</span>
                    </div>
                    <div className="text-small text-muted">{description ?? `새로 만들거나, 만들어 둔 ${josa(noun, '을/를')} 고른다.`}</div>
                </div>

                <button
                    type="button"
                    onClick={onNew}
                    disabled={disabled}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg border border-line text-left hover:bg-text/[0.04] disabled:opacity-40"
                >
                    <span className="flex items-center justify-center w-8 h-8 rounded-md bg-accent/10 text-accent">
                        <Icon name="plus" size={16} />
                    </span>
                    <span className="flex flex-col">
                        <span className="text-body font-medium text-text">{newLabel}</span>
                        {newHint && <span className="text-note text-muted">{newHint}</span>}
                    </span>
                </button>

                <div className="flex flex-col gap-1">
                    <div className="text-note text-muted px-1">만들어 둔 것 · {items.length}</div>
                    {items.length === 0 ? (
                        <div className="rounded-lg border border-line"><EmptyState compact icon={icon} title={`만들어 둔 ${noun}${josa(noun, '이/가').slice(noun.length)} 없다`} description={`위의 「${newLabel}」로 시작한다.`} /></div>
                    ) : (
                        <ul className="flex flex-col rounded-lg border border-line overflow-hidden">
                            {items.map((it) => (
                                <li key={it.id} className="border-b border-line last:border-b-0">
                                    <button
                                        type="button"
                                        onClick={() => onOpen(it.id)}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-text/[0.04]"
                                    >
                                        {it.emoji
                                            ? <span className="w-4 text-center text-small leading-none shrink-0">{it.emoji}</span>
                                            : <Icon name={it.icon ?? icon} size={14} className="text-muted shrink-0" />}
                                        <span className="text-body text-text truncate">{it.name}</span>
                                        <span className="flex-1" />
                                        {it.folder && (
                                            <span className="flex items-center gap-1 text-note text-muted truncate max-w-[40%]">
                                                <Icon name="folder" size={11} /> {it.folder}
                                            </span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
