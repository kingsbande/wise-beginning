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
            void r.update().catch((error: unknown) => {
              console.warn('Service worker update check failed:', error)
            })
          }, 60 * 60 * 1000)
        }
      },
      onRegisterError(error: unknown) {
        console.error('Service worker registration failed:', error)
      },
      onNeedRefresh() {
        if (document.getElementById('sw-update-banner')) return

        const banner = document.createElement('div')
        banner.id = 'sw-update-banner'
        banner.className = 'sw-update-banner'
        banner.setAttribute('role', 'status')
        banner.setAttribute('aria-live', 'polite')

        const message = document.createElement('div')
        message.className = 'sw-update-message'
        const title = document.createElement('p')
        title.className = 'sw-update-title'
        title.textContent = 'A new version is available'
        const warning = document.createElement('p')
        warning.className = 'sw-update-warning'
        warning.textContent = 'Updating reloads the app. Save any work in progress first.'
        message.append(title, warning)

        const actions = document.createElement('div')
        actions.className = 'sw-update-actions'
        const updateButton = document.createElement('button')
        updateButton.type = 'button'
        updateButton.className = 'sw-update-button'
        updateButton.textContent = 'Update now'
        const dismissButton = document.createElement('button')
        dismissButton.type = 'button'
        dismissButton.className = 'sw-dismiss-button'
        dismissButton.textContent = 'Dismiss'

        actions.append(updateButton, dismissButton)
        banner.append(message, actions)
        document.body.appendChild(banner)

        updateButton.addEventListener('click', () => {
          if (!updateSW) {
            console.error('Service worker update is unavailable.')
            warning.textContent = 'The update is not ready. Please try again shortly.'
            return
          }

          updateButton.disabled = true
          updateButton.textContent = 'Updating…'
          void updateSW().catch((error: unknown) => {
            console.error('Service worker update failed:', error)
            warning.textContent = 'The update could not finish. Check your connection and try again.'
            updateButton.disabled = false
            updateButton.textContent = 'Retry update'
          })
        })
        dismissButton.addEventListener('click', () => {
          banner.remove()
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
