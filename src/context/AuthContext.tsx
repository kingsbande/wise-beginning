import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { queryClient } from '../lib/queryClient'
import { Profile } from '../types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, full_name, role, school_id, avatar_url, must_change_password, username, schools ( name, logo_url, registration_terms )',
      )
      .eq('id', userId)
      .single()

    if (!error && data) {
      const row = data as unknown as {
        id: string
        full_name: string
        role: Profile['role']
        school_id: string
        avatar_url: string | null
        must_change_password: boolean
        username: string | null
        schools: { name: string; logo_url: string | null; registration_terms: string | null } | null
      }
      setProfile({
        id: row.id,
        full_name: row.full_name,
        role: row.role,
        school_id: row.school_id,
        school_name: row.schools?.name ?? 'your school',
        school_logo_url: row.schools?.logo_url ?? null,
        school_registration_terms: row.schools?.registration_terms ?? null,
        avatar_url: row.avatar_url,
        must_change_password: row.must_change_password,
        username: row.username,
      })
    } else {
      setProfile(null)
    }
  }

  useEffect(() => {
    let isMounted = true

    const finishLoading = () => {
      if (isMounted) setLoading(false)
    }

    const startSessionCheck = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (!isMounted) return

        if (error) {
          console.warn('Auth session check failed:', error.message)
          finishLoading()
          return
        }

        setSession(data.session)

        if (data.session) {
          await loadProfile(data.session.user.id)
        }
      } catch (err) {
        console.warn('Auth bootstrap failed:', err)
      } finally {
        finishLoading()
      }
    }

    void startSessionCheck()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return

      setSession(newSession)
      if (newSession) {
        setLoading(true)
        loadProfile(newSession.user.id).finally(() => {
          if (isMounted) setLoading(false)
        })
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    queryClient.clear()
  }

  async function refreshProfile() {
    if (session) {
      await loadProfile(session.user.id)
    }
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
