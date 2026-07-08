import { StoreProvider } from './store/store'
import Shell from './components/app/Shell'

function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

export default App
