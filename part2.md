<!-- FILE: package.json -->
```json
{
  "name": "student-registration",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.4",
    "@tanstack/react-query": "^5.59.16",
    "jspdf": "^2.5.2",
    "lucide-react": "^1.28.0",
    "pg": "^8.23.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-legacy": "^5.4.3",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.10",
    "terser": "^5.49.2",
    "typescript": "^5.5.4",
    "vite": "^5.4.2",
    "vite-plugin-pwa": "^1.3.0"
  }
}
```

<!-- FILE: vite.config.ts -->
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 60', 'android >= 6', 'defaults', 'not IE 11'],
      modernTargets: ['chrome >= 60', 'android >= 6'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    }),
    VitePWA({
      // Keep the app stable while users switch tabs/apps. We only prompt for updates
      // instead of auto-reloading the entire SPA when the SW detects a new build.
      registerType: 'prompt',
      injectRegister: 'inline',
      manifest: {
        name: "Wise beginning",
        short_name: "Wise beginning",
        description: 'Student registration and parent dashboard',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        orientation: 'portrait-primary'
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5
              },
              networkTimeoutSeconds: 5
            }
          }
        ]
      }
    })
  ],
  server: { port: 5173 },
})
```

<!-- FILE: vercel.json -->
```json
{
  "headers": [
    {
      "source": "/index.html",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    },
    {
      "source": "/sw.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    },
    {
      "source": "/registerSW.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    },
    {
      "source": "/manifest.webmanifest",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/((?!manifest\\.webmanifest|sw\\.js|registerSW\\.js|workbox-.*\\.js|pwa-.*\\.png|favicon\\.ico|apple-touch-icon\\.png).*)",
      "destination": "/index.html"
    }
  ]
}
```

<!-- FILE: index.html -->
```html
<!doctype html>
<html lang="en">
  <head>
    <script>
      // Polyfill globalThis for older browsers/WebViews (e.g., Chrome < 71 on older Android versions)
      if (typeof globalThis === 'undefined') {
        window.globalThis = window;
      }
    </script>
    <meta charset="UTF-8" />
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0f172a" />
    <meta name="color-scheme" content="dark" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Wise Beginning" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <link rel="icon" type="image/png" href="/src/assets/logo.png" />
    <link rel="apple-touch-icon" href="/src/assets/logo.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>Wise Beginning Pvt School</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

<!-- FILE: .gitignore -->
```gitignore
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
```

<!-- FILE: src/main.tsx -->
```tsx
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
```

<!-- FILE: src/lib/supabaseClient.ts -->
```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in dev rather than silently breaking auth later
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

<!-- FILE: src/lib/queryClient.ts -->
```ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000, // 5 minutes — data stays fresh, no unnecessary refetches
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})
```
