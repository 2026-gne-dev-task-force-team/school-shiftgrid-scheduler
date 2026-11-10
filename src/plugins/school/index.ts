/**
 * 「학교 정보」 플러그인 — 학교(school.school, 싱글톤 + 페이지 본문) · 학년도(school.year) · 반(school.class) 노드 + 화면 둘.
 *   🔴 학교 화면은 page 폴더를 안 고친다 — 컬렉션 모듈의 RecordPage(칸 + page-doc 본문)를 그대로 쓴다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, CommandContext } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { schoolNodeTypes, schoolNodeTypeImpl, initSchool, getKit } from './nodes';
import { schoolApi } from './api';
import { SchoolPage } from './SchoolPage';

export const schoolPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { school: '0.1.0' },
        requires: { nodes: '^0.1', collection: '^0.2' },
        supports: { 'page-doc': '^0.1' },
        contributes: {
            interfaces: [{ name: 'school', version: '0.1.0', label: '학교 정보', desc: '학교 · 학년도 · 반' }],
            views: [
                {
                    id: 'editor', title: '학교', icon: 'home', defaultArea: 'center',
                    placement: { areas: ['center'], singleton: true },
                    layout: { minWidth: 280, squeeze: 'scroll' },
                    component: 'Editor',
                },
                {
                    id: 'sheet', title: '학년도', icon: 'calendar', defaultArea: 'center',
                    placement: { areas: ['center'], singleton: true },
                    layout: { minWidth: 280, squeeze: 'scroll' },
                    component: 'Sheet',
                },
            ],
            commands: [{ id: 'school.openYear', title: '학년도 열기', icon: 'calendar', palette: false }],
            nodeTypes: schoolNodeTypes,
        },
    },
    components: {
        Editor: ({ host }) => createElement(SchoolPage, { host }),
        Sheet: ({ host, peek, leaf }) => { const k = getKit(); return k ? createElement(k.Tab, { host, peek, leafId: leaf.id }) : null; },
    },
    commands: {
        'school.openYear': (_host: PluginHost, ctx?: CommandContext) => { getKit()?.openList(ctx?.nodeId); },
    },
    nodeTypes: schoolNodeTypeImpl,
    modules: { school: schoolApi },
    lifecycle: {
        onActivate(host: PluginHost) { initSchool(host); },
    },
});

export default schoolPlugin;
