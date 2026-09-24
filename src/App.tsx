import { StoreProvider } from './store/store';
import Shell from './ui/Shell';

export default function App() {
    return (
        <StoreProvider>
            <Shell />
        </StoreProvider>
    );
}
