/**
 * 「시간표 짜기(편성)」 신분증 — v1 편성 화면을 legacy/ 사본 iframe 으로 띄운다(설계 ① 2-1 · P10a). id 는 폴더명과 같다(구조 검사 ⑧).
 * ✅ T-8p8(R51): app/plugins.ts CATALOG·site.config.json 에 올렸다(T-10ec 부터 기본 꺼짐 defaultOff — 설정에서 켠다). 화면 셋: edit·grid·versions(index.ts).
 */
import type { PluginManifest } from '../../pane-ui-system/plugin';

export const manifest: PluginManifest = {
    id: 'v1-editor',
    name: 'v1 편성기(옛)',
    defaultOff: true,
    version: '0.1.0',
    minHostVersion: '0.1.0',
    layer: 'domain',
    icon: 'table',
    description: '예전 시간표 편성 화면입니다. 새 편성 화면으로 옮기는 중이라 처음엔 꺼져 있습니다.',
    about: {
        what: '예전(v1) 시간표 편성 화면 일곱 개를 한 판 안에서 그대로 씁니다. 새 편성 조각으로 옮기는 중이라 옛것으로 분류했고, 새로 설치한 기기에서는 꺼진 채 시작합니다.',
        use: ['예전 방식 그대로 시간표를 짜거나 고쳐야 할 때'],
        off: '편성 화면만 사라집니다. 저장된 시간표는 그대로입니다. 켜면 예전처럼 편성 화면이 다시 뜹니다.',
        with: '화면은 같은 출처의 별도 창(iframe)에 뜹니다. 이미 쓰던 기기는 켜진 채로 유지됩니다.',
    },
};
