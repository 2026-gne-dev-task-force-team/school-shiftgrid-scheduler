/**
 * 「플랫폼(바닥)」 상세 — 바닥이 플러그인에게 주는 것(HOST_SERVICES 표)과 지금 켜진 약속 목록(P6a · R8).
 * ⭐ 모양은 플러그인 상세와 같은 부품(머리·Section·카드 줄)을 쓴다 — 설정 화면 안에서 스타일이 따로 놀지 않게(Q1·F4).
 */
import { HOST_SERVICES, HOST_VERSION, listInterfaces, usePluginRegistry } from '../../../pane-ui-system/plugin';
import { Section, RelRow, DetailTitle, Badge } from './plugin-parts';

export function PlatformDetail() {
    usePluginRegistry();   // 약속은 플러그인을 켜고 끄면 바뀐다
    const ifaces = listInterfaces();
    const services = Object.entries(HOST_SERVICES);
    return (
        <div className="flex flex-col gap-4">
            <DetailTitle name="플랫폼(바닥)" version={HOST_VERSION} id="platform" badges={<Badge>바닥</Badge>} />
            <p className="text-body text-text leading-relaxed">
                모든 플러그인이 올라서는 바닥입니다. 끌 수 없고, 아래 기능을 플러그인마다 같은 모양으로 내줍니다.
            </p>
            <Section title="바닥이 주는 기능" count={services.length}>
                <div className="flex flex-col rounded border border-line overflow-hidden">
                    {services.map(([key, s]) => (
                        <RelRow key={key} left={s.label} note={`${s.desc} (예: ${s.example})`} right={`host.${key}`} />
                    ))}
                </div>
            </Section>
            <Section title="켜진 약속" count={ifaces.length}>
                <div className="flex flex-col rounded border border-line overflow-hidden">
                    {ifaces.map((i) => (
                        <RelRow key={i.name} left={i.name} note={i.provider ? `채움: ${i.provider}` : '채우는 쪽 없음'} right={`v${i.version}`} />
                    ))}
                </div>
            </Section>
        </div>
    );
}
