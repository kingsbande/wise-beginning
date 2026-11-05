// Vercel serverless function: returns the web app manifest for one school.
// GET /api/manifest?s=<slug>&base=<'' or '/s/<slug>'>

interface Req {
  query: Record<string, string | string[] | undefined>
}
interface Res {
  status(code: number): Res
  setHeader(name: string, value: string): void
  json(body: unknown): void
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

// Cloudinary only: resizes the logo and pads it onto a white square.
// safeZone shrinks the logo so Android can crop maskable icons safely.
function cloudinaryIcon(url: string, size: number, safeZone: boolean): string | null {
  const marker = '/image/upload/'
  if (!url.includes('res.cloudinary.com') || !url.includes(marker)) return null
  const inner = Math.round(size * (safeZone ? 0.7 : 1))
  return url.replace(
    marker,
    `${marker}c_fit,w_${inner},h_${inner}/c_pad,w_${size},h_${size},b_rgb:ffffff,f_png/`,
  )
}

function shortName(name: string): string {
  if (name.length <= 14) return name
  const words = name.split(/\s+/)
  const firstTwo = words.slice(0, 2).join(' ')
  return firstTwo.length <= 14 ? firstTwo : words[0]
}

export default async function handler(req: Req, res: Res) {
  const slug = one(req.query.s).toLowerCase()
  const base = one(req.query.base)

  if (!SLUG_PATTERN.test(slug) || (base !== '' && base !== `/s/${slug}`)) {
    res.status(400).json({ error: 'Invalid school' })
    return
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    res.status(500).json({ error: 'Server is not configured' })
    return
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_school_branding`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_slug: slug }),
  })

  if (!response.ok) {
    res.status(502).json({ error: 'Could not load school' })
    return
  }

  const rows = (await response.json()) as Array<{ name: string; logo_url: string | null }>
  const school = rows[0]
  if (!school) {
    res.status(404).json({ error: 'School not found' })
    return
  }

  const startUrl = `${base}/`
  const logo = school.logo_url
  const icon192 = (logo && cloudinaryIcon(logo, 192, false)) || '/pwa-192x192.png'
  const icon512 = (logo && cloudinaryIcon(logo, 512, false)) || '/pwa-512x512.png'
  const iconMaskable = (logo && cloudinaryIcon(logo, 512, true)) || '/pwa-maskable-512x512.png'

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400')
  res.status(200).json({
    id: startUrl,
    name: school.name,
    short_name: shortName(school.name),
    description: `${school.name} student portal`,
    start_url: startUrl,
    scope: startUrl,
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    orientation: 'portrait-primary',
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png' },
      { src: icon512, sizes: '512x512', type: 'image/png' },
      { src: iconMaskable, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  })
}