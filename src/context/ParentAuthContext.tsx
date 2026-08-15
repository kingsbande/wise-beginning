import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { queryClient } from '../lib/queryClient'

export interface ParentProfile {
  id: string
  full_name: string
  username: string
  school_id: string
  school_name: string
  school_logo_url: string | null
  must_change_password: boolean
  student_id: string
}

interface ParentAuthContextValue {
  session: Session | null
  parentProfile: ParentProfile | null
  loading: boolean
  signIn: (schoolCode: string, username: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshParentProfile: () => Promise<void>
}

const ParentAuthContext = createContext<ParentAuthContextValue | undefined>(undefined)

export function ParentAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [parentProfile, setParentProfile] = useState<ParentProfile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadParentProfile(userId: string) {
    const { data: account, error } = await supabase
      .from('parent_accounts')
      .select('id, full_name, username, school_id, must_change_password, schools ( name, logo_url )')
      .eq('id', userId)
      .single()

    if (error || !account) {
      setParentProfile(null)
      return
    }

    // A parent account links to exactly one student.
    const { data: student } = await supabase
      .from('students')
      .select('id')
      .eq('parent_account_id', userId)
      .maybeSingle()

    const row = account as unknown as {
      id: string
      full_name: string
      username: string
      school_id: string
      must_change_password: boolean
      schools: { name: string; logo_url: string | null } | null
    }

    setParentProfile({
      id: row.id,
      full_name: row.full_name,
      username: row.username,
      school_id: row.school_id,
      school_name: row.schools?.name ?? 'your school',
      school_logo_url: row.schools?.logo_url ?? null,
      must_change_password: row.must_change_password,
      student_id: student?.id ?? '',
    })
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
          console.warn('Parent auth session check failed:', error.message)
          finishLoading()
          return
        }

        setSession(data.session)

        if (data.session) {
          await loadParentProfile(data.session.user.id)
        }
      } catch (err) {
        console.warn('Parent auth bootstrap failed:', err)
      } finally {
        finishLoading()
      }
    }

    void startSessionCheck()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return

      setSession(newSession)
      if (newSession) {
        void loadParentProfile(newSession.user.id)
      } else {
        setParentProfile(null)
      }
    })

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signIn(schoolCode: string, username: string, password: string) {
    // The real email is never shown to the parent — it's synthesized
    // the same way create-parent-account built it at creation time.
    const email = `${username}@parents.${schoolCode}.app`
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? 'Invalid school code, username, or password.' : null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    queryClient.clear()
  }

  async function refreshParentProfile() {
    if (session) {
      await loadParentProfile(session.user.id)
    }
  }

  return (
    <ParentAuthContext.Provider
      value={{ session, parentProfile, loading, signIn, signOut, refreshParentProfile }}
    >
      {children}
    </ParentAuthContext.Provider>
  )
}

export function useParentAuth() {
  const ctx = useContext(ParentAuthContext)
  if (!ctx) throw new Error('useParentAuth must be used within ParentAuthProvider')
  return ctx
}
