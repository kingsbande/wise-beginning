import { createClient } from '@supabase/supabase-js'
import { getSchoolSlug } from './schoolSlug'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in dev rather than silently breaking auth later
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: `sb-auth-${getSchoolSlug() ?? 'none'}` },
})
