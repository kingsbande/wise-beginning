import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import App from './App'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

let updateSW: (() => Promise<void>) | undefined

// Delay SW registration to prevent blocking on older Android versions
if ('serviceWorker' in navigator) {
  const register = () => {
    updateSW = registerSW({
      onRegistered(r: ServiceWorkerRegistration | undefined) {
        console.log('Service worker registered:', r)
        // Check for updates every hour
        if (r) {
          setInterval(() => {
            r.update()
          }, 60 * 60 * 1000)
        }
      },
      onRegisterError(error: unknown) {
        console.error('Service worker registration failed:', error)
      },
      onNeedRefresh() {
        console.log('A new version is available. Reloading to apply update.')
        updateSW?.().then(() => {
          window.location.reload()
        })
      },
    })
  }

  if (document.readyState === 'complete') {
    register()
  } else {
    window.addEventListener('load', register)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
)
