/**
 * 꺼진·없는 플러그인 뷰의 자리표시 — leaf 는 트리에 그대로 남고, 몸통만 이것으로 바뀐다.
 *
 * 🔴 ⛔ 창틀은 viewId 의 뜻을 모른다 — ownerOfView 가 접두사로 주인을 알아낸다.
 *   ① 주인이 꺼져 있으면: 「<이름> 플러그인이 꺼져 있습니다 · [켜기]」 — 누르면 그 자리에서 실뷰로 돌아온다.
 *   ② 주인을 모르면(코드에서 아예 빠진 viewId): 제목만 옅게(유령 탭이 아니라 보존된 자리다).
 */
import type { Leaf } from '../layout/tree';
import { Icon } from '../primitives/Icon';
import { Button } from '../primitives/Button';
import { ownerOfView, enablePlugin, usePluginRegistry } from './registry';

export function ViewPlaceholder({ leaf, surface }: { leaf: Leaf; surface: string }) {
    usePluginRegistry();   // 켜기/끄기·블록 복귀에 다시 그린다
    const owner = ownerOfView(leaf.viewId);

    // 🔴 블록 — requires 가 안 찼다(사유를 그린다). 사용자가 끈 게 아니라 비영구라, 「켜기」가 아니라 사유만 보인다
    //    (제공자가 켜지면 자동 복귀한다 — 조용히 죽지 않는다, 명세 「페이블 설계 검증 반영」 1).
    if (owner && owner.blocked) {
        return (
            <div className={`flex-1 min-h-0 grid place-items-center ${surface} overflow-hidden px-8 py-6 text-center`}>
                <div className="flex flex-col items-center gap-3 max-w-[22rem]">
                    <Icon name="warn" size={28} className="text-warn/60" />
                    <p className="text-body text-text leading-relaxed select-none">「{owner.name}」 플러그인이 의존을 못 채웠습니다.</p>
                    {owner.reason && <p className="text-small text-muted leading-relaxed select-none">{owner.reason.replace(/^꺼짐 — /, '')}</p>}
                </div>
            </div>
        );
    }

    if (owner && !owner.enabled) {
        return (
            <div className={`flex-1 min-h-0 grid place-items-center ${surface} overflow-hidden px-8 py-6 text-center`}>
                <div className="flex flex-col items-center gap-3 max-w-[20rem]">
                    <Icon name="ban" size={28} className="text-muted/50" />
                    <p className="text-body text-muted leading-relaxed select-none">
                        「{owner.name}」 플러그인이 꺼져 있습니다.
                    </p>
                    <Button variant="solid" tone="accent" onClick={() => enablePlugin(owner.id)}>켜기</Button>
                </div>
            </div>
        );
    }

    // 정말 모르는 viewId — 제목만 옅게(트리는 안 건드린다)
    return (
        <div className={`flex-1 min-h-0 grid place-items-center ${surface} overflow-hidden px-6 text-center`}>
            <p className="text-2xl font-light text-muted/50 select-none truncate max-w-full">{leaf.title}</p>
        </div>
    );
}
