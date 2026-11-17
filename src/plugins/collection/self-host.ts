/**
 * 컬렉션 자기 host — 켜질 때(onActivate) 쥐고 꺼질 때 놓는다(T-10fk · T-10fe 와 같은 꼴).
 *   🔴 약속으로 내준 부품(openInTab·Tab·RecordPage·레코드 탭)은 **부른 쪽 host** 를 받는다. 그 host 로 모듈을 use 하면
 *      부른 쪽 manifest 의 선언으로 검사돼, 부른 쪽이 nodes·page-doc 을 안 적었으면 「선언 안 한 인터페이스 use」로 던진다.
 *   ⭐ 그래서 모듈(nodes·page-doc)은 컬렉션 자기 host(자기 requires·supports)로만 받는다. 부른 쪽 host 는 열기(workspace)·알림(notify) 창구로만 쓴다.
 */
import type { PluginHost } from '../../pane-ui-system/plugin';

let selfHost: PluginHost | null = null;
export function bindCollectionHost(host: PluginHost | null): void { selfHost = host; }

/** 모듈을 받을 host — 켜져 있으면 늘 컬렉션 자기 host. 꾸러미를 안 켜고 부품만 그리는 시험에서만 넘어온 host 로 버틴다. */
export function moduleHost(caller: PluginHost): PluginHost { return selfHost ?? caller; }
