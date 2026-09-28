import { StoreProvider } from './store/store';
import { HelpProvider } from './ui/help/HelpContext';
import Shell from './ui/Shell';

export default function App() {
    return (
        <StoreProvider>
            <HelpProvider>
                <Shell />
            </HelpProvider>
        </StoreProvider>
    );
}
