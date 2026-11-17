import { Select, TextInput } from '../../pane-ui-system';
import { staffChoices } from './people';

/**
 * 사람 고르기(공통 부품) — 교직원 명단(staff)이 있으면 거기서 고르고, 없으면 이름을 직접 적는다.
 * 고른 사람은 (참조 id, 이름) 둘로 건넨다. 직접 적으면 참조는 빈 칸(부른 쪽이 정한다).
 */
export function PersonSelect({ refId, name, onPick }: { refId: string; name: string; onPick: (ref: string, name: string) => void }) {
    const choices = staffChoices();
    if (choices.length === 0) return <TextInput value={name} onChange={(e) => onPick('', e.target.value)} />;
    return (
        <Select
            value={refId} placeholder="명단에서 고르세요" options={choices}
            onChange={(e) => { const c = choices.find((x) => x.value === e.target.value); onPick(c?.value ?? '', c?.label ?? ''); }}
        />
    );
}
