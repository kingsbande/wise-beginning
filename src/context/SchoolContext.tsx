import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getSchoolSlug } from '../lib/schoolSlug'
import { applyBrowserBranding } from '../lib/schoolBranding'

export type SchoolStatus = 'loading' | 'ready' | 'not_found' | 'no_slug' | 'error'

interface SchoolContextValue {
  status: SchoolStatus
  slug: string | null
  name: string
  logoUrl: string | null
}

const SchoolContext = createContext<SchoolContextValue | undefined>(undefined)

export function SchoolProvider({ children }: { children: ReactNode }) {
  const slug = getSchoolSlug()
  const [value, setValue] = useState<SchoolContextValue>({
    status: slug ? 'loading' : 'no_slug',
    slug,
    name: '',
    logoUrl: null,
  })

  useEffect(() => {
    if (!slug) return
    let cancelled = false

    const load = async () => {
      // Public lookup: returns only the school's name and logo, even when logged out.
      const { data, error } = await supabase.rpc('get_school_branding', { p_slug: slug })
      if (cancelled) return

      if (error) {
        setValue((current) => ({ ...current, status: 'error' }))
        return
      }

      const row = (Array.isArray(data) ? data[0] : data) as
        | { name: string; logo_url: string | null }
        | undefined

      if (!row) {
        setValue((current) => ({ ...current, status: 'not_found' }))
        return
      }

      applyBrowserBranding(slug, row.name, row.logo_url ?? null)
      setValue({ status: 'ready', slug, name: row.name, logoUrl: row.logo_url ?? null })
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [slug])

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>
}

export function useSchool() {
  const ctx = useContext(SchoolContext)
  if (!ctx) throw new Error('useSchool must be used within SchoolProvider')
  return ctx
}
