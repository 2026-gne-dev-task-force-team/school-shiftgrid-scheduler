/**
 * 앱 진입점 — v2 작업대(껍데기와 표). 켜면 빈 작업대가 뜬다.
 * ⚠️ v1 화면(src/ui/screens/**)·엔진·스키마는 그대로 둔다 — 나중 모듈이 조각을 가져다 쓴다.
 *    v1 Shell 로 가는 길만 여기서 끊었다(파일은 지우지 않았다).
 */
import { V2StoreProvider } from './v2/store';
import { Workbench } from './v2/ui/Workbench';

export default function App() {
    return (
        <V2StoreProvider>
            <Workbench />
        </V2StoreProvider>
    );
}
