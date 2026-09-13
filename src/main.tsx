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
        // Show a non-intrusive banner instead of force-reloading.
        // The silent reload was causing the entire app to restart every time
        // a new build was detected (the SW checks this on window focus).
        const banner = document.createElement('div')
        banner.id = 'sw-update-banner'
        banner.innerHTML = `
          <div style="
            position:fixed;bottom:16px;left:50%;transform:translateX(-50%);
            background:#1e293b;color:#f8fafc;padding:12px 20px;border-radius:12px;
            display:flex;align-items:center;gap:12px;box-shadow:0 4px 24px rgba(0,0,0,.35);
            font-family:system-ui,sans-serif;font-size:14px;z-index:99999;
          ">
            <span>🔄 A new version is available</span>
            <button id="sw-update-btn" style="
              background:#6366f1;color:#fff;border:none;border-radius:8px;
              padding:6px 14px;cursor:pointer;font-size:13px;font-weight:600;
            ">Update now</button>
            <button id="sw-dismiss-btn" style="
              background:transparent;color:#94a3b8;border:none;cursor:pointer;font-size:18px;line-height:1;
            ">✕</button>
          </div>
        `
        document.body.appendChild(banner)
        document.getElementById('sw-update-btn')?.addEventListener('click', () => {
          updateSW?.()
        })
        document.getElementById('sw-dismiss-btn')?.addEventListener('click', () => {
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
