import { getRouterBasename } from './schoolSlug'

// Cloudinary only: a solid-background square. Other hosts are used as they are.
function squareIcon(url: string, size: number): string {
  const marker = '/image/upload/'
  if (!url.includes('res.cloudinary.com') || !url.includes(marker)) return url
  return url.replace(marker, `${marker}c_fit,w_${size},h_${size}/c_pad,w_${size},h_${size},b_rgb:ffffff,f_png/`)
}

function setMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.name = name
    document.head.appendChild(el)
  }
  el.content = content
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

// Updates the tab title, favicon, iPhone home-screen name and icon, and the manifest link.
export function applyBrowserBranding(slug: string, name: string, logoUrl: string | null) {
  document.title = name
  setMeta('apple-mobile-web-app-title', name)

  if (logoUrl) {
    setLink('apple-touch-icon', squareIcon(logoUrl, 180))
    setLink('icon', squareIcon(logoUrl, 64))
  }

  // The serverless manifest does not exist under `vite dev`.
  if (import.meta.env.DEV) return

  const href = `/api/manifest?s=${encodeURIComponent(slug)}&base=${encodeURIComponent(getRouterBasename())}`
  const [first, ...extra] = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]'))
  extra.forEach((link) => link.remove())
  if (first) {
    first.href = href
  } else {
    setLink('manifest', href)
  }
}