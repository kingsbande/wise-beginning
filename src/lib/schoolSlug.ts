// Works out which school this page load belongs to.
//
// Order:
//   1. Subdomain, e.g. wisebeginning.yourdomain.com (only when VITE_BASE_DOMAIN is set)
//   2. Path, e.g. yourapp.vercel.app/s/wisebeginning/login
//   3. VITE_DEFAULT_SCHOOL_SLUG, so an existing URL keeps working during the move
//
// When you buy a domain later, set VITE_BASE_DOMAIN and nothing else changes.

const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api', 'platform'])
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const PATH_PATTERN = /^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\/|$)/

const BASE_DOMAIN = (import.meta.env.VITE_BASE_DOMAIN as string | undefined)?.trim().toLowerCase()
const DEFAULT_SLUG = (import.meta.env.VITE_DEFAULT_SCHOOL_SLUG as string | undefined)
  ?.trim()
  .toLowerCase()

interface ResolvedSchool {
  slug: string | null
  // React Router basename: '/s/<slug>' for path-based links, '' otherwise.
  basename: string
}

function resolve(): ResolvedSchool {
  if (typeof window === 'undefined') return { slug: null, basename: '' }

  const host = window.location.hostname.toLowerCase()

  if (BASE_DOMAIN && host.endsWith(`.${BASE_DOMAIN}`)) {
    const label = host.slice(0, -(BASE_DOMAIN.length + 1))
    if (SLUG_PATTERN.test(label) && !RESERVED_SUBDOMAINS.has(label)) {
      return { slug: label, basename: '' }
    }
  }

  const match = window.location.pathname.toLowerCase().match(PATH_PATTERN)
  if (match) {
    return { slug: match[1], basename: `/s/${match[1]}` }
  }

  if (DEFAULT_SLUG && SLUG_PATTERN.test(DEFAULT_SLUG)) {
    return { slug: DEFAULT_SLUG, basename: '' }
  }

  return { slug: null, basename: '' }
}

// A school never changes without a full page load, so resolve once.
const resolved = resolve()

export function getSchoolSlug(): string | null {
  return resolved.slug
}

export function getRouterBasename(): string {
  return resolved.basename
}
