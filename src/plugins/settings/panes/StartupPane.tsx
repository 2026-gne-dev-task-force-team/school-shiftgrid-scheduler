/**
 * 「창틀 > 시작 화면」 설정 Pane — 앱을 켤 때마다 띄워 둘 뷰를 고른다(쥔님 2026-11-09).
 *   켜 둔 뷰는 닫아 뒀어도 다음 시작에 다시 열린다. 이미 떠 있으면 그대로 둔다(Workbench 가 연다).
 *   🔴 plugins/ 라 하드코딩 색 검사 — 토큰 클래스로만.
 */
import { usePaneSettings, setPaneSettings, Icon, Button } from '../../../pane-ui-system';
import { useContribVersion, listPlugins } from '../../../pane-ui-system/plugin';
import type { SettingsPaneProps } from '../registry';

export function StartupPane({ host }: SettingsPaneProps) {
    const { settings } = usePaneSettings();
    useContribVersion();
    // 빈 탭(app.*)은 고를 거리가 아니다 — 플러그인 뷰만
    const views = host.views.list().filter((v) => !v.id.startsWith('app.'));
    const on = new Set(settings.startupViews);
    // 뷰 id 앞머리(`<플러그인id>.`)가 주인이다 — 어느 플러그인 화면인지 같이 보여 준다
    const owners = new Map(listPlugins().map((p) => [p.id, p.name]));
    const ownerOf = (id: string) => owners.get(id.split('.')[0]);
    const toggle = (id: string) => setPaneSettings({
        startupViews: on.has(id) ? settings.startupViews.filter((x) => x !== id) : [...settings.startupViews, id],
    });
    const AREA = { left: '왼쪽', center: '가운데', right: '오른쪽' } as const;

    return (
        <div className="flex flex-col gap-3 max-w-[560px]">
            <p className="text-small text-muted">
                켜 둔 화면은 프로그램을 열 때마다 띄웁니다. 닫아 뒀어도 다음에 켜면 다시 열립니다. 저장은 이 기기에만 남습니다.
            </p>
            <div className="flex flex-col rounded border border-line overflow-hidden">
                {views.map((v) => {
                    const checked = on.has(v.id);
                    return (
                        <div key={v.id} className={`flex items-center gap-2 px-3 h-row border-b border-line last:border-b-0
                            ${checked ? 'text-text' : 'text-muted'}`}>
                            <Icon name={v.icon ?? 'dot'} size={16} className="shrink-0" />
                            <span className="flex-1 min-w-0 truncate text-body">{v.title}{ownerOf(v.id) && <span className="ml-1.5 text-note text-muted">{ownerOf(v.id)}</span>}</span>
                            <span className="text-small text-muted">{AREA[v.defaultArea ?? 'center']}</span>
                            <Button
                                size="sm"
                                variant={checked ? 'accent' : 'ghost'}
                                aria-pressed={checked}
                                aria-label={`${v.title} 시작할 때 띄우기`}
                                onClick={() => toggle(v.id)}
                            >
                                {checked ? '띄움' : '안 띄움'}
                            </Button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
