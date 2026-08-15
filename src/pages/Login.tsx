import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import logo from '../assets/logo.png'
import { LoadingScreen } from '../components/LoadingScreen'
import { InstallButton } from '../components/InstallButton'
import { IosInstallHint } from '../components/IosInstallHint'

// Parents sign in with just their username (no "@"), which maps to
// this synthetic address created for them under the hood at
// account-creation time. Admins sign in with a real email — the "@"
// in what they type is what tells the two cases apart.
const PARENT_EMAIL_DOMAIN = 'parents.app'

type Destination = '/admin' | '/parent' | '/parent/change-password'

async function resolveDestination(userId: string): Promise<Destination | null> {
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (adminProfile?.role === 'admin') {
    return '/admin'
  }

  const { data: parentAccount } = await supabase
    .from('parent_accounts')
    .select('must_change_password')
    .eq('id', userId)
    .maybeSingle()

  if (parentAccount) {
    return parentAccount.must_change_password ? '/parent/change-password' : '/parent'
  }

  return null
}

export function Login() {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  // Returning to /login with a live session (either role) skips
  // straight to the right dashboard instead of showing the form.
  useEffect(() => {
    let cancelled = false

    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()

        if (cancelled) return

        if (error) {
          console.warn('Session check failed on login page:', error.message)
          setCheckingSession(false)
          return
        }

        if (data.session) {
          const destination = await resolveDestination(data.session.user.id)
          if (destination && !cancelled) {
            navigate(destination, { replace: true })
            return
          }
        }
      } catch (err) {
        console.warn('Login session bootstrap failed:', err)
      }

      if (!cancelled) setCheckingSession(false)
    }

    void checkSession()

    return () => {
      cancelled = true
    }
  }, [navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const trimmed = identifier.trim()
    const email = trimmed.includes('@')
      ? trimmed
      : `${trimmed.toLowerCase()}@${PARENT_EMAIL_DOMAIN}`

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError || !data.user) {
      setSubmitting(false)
      setError('Invalid email/username or password.')
      return
    }

    const destination = await resolveDestination(data.user.id)

    if (!destination) {
      await supabase.auth.signOut()
      setSubmitting(false)
      setError('This account is not set up correctly. Please contact the school.')
      return
    }

    setSubmitting(false)
    navigate(destination)
  }

  if (checkingSession || submitting) {
    return <LoadingScreen />
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-rose-900 px-4">
      {/* Same decorative wave used in the admin dashboard hero, for continuity */}
      <svg
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 text-white/10"
        viewBox="0 0 200 200"
        fill="none"
        aria-hidden="true"
      >
        <path d="M10 100 C 50 40, 150 40, 190 100 C 150 160, 50 160, 10 100 Z" stroke="currentColor" strokeWidth="1" />
        <path d="M30 100 C 60 60, 140 60, 170 100 C 140 140, 60 140, 30 100 Z" stroke="currentColor" strokeWidth="1" />
        <path d="M50 100 C 70 80, 130 80, 150 100 C 130 120, 70 120, 50 100 Z" stroke="currentColor" strokeWidth="1" />
      </svg>
      <svg
        className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 text-white/5"
        viewBox="0 0 200 200"
        fill="none"
        aria-hidden="true"
      >
        <path d="M10 100 C 50 40, 150 40, 190 100 C 150 160, 50 160, 10 100 Z" stroke="currentColor" strokeWidth="1" />
        <path d="M30 100 C 60 60, 140 60, 170 100 C 140 140, 60 140, 30 100 Z" stroke="currentColor" strokeWidth="1" />
      </svg>

      <div className="relative w-full max-w-sm">
        <div className="relative mt-14 rounded-2xl border border-white/10 bg-white/5 p-8 pt-16 text-center shadow-2xl shadow-black/40 backdrop-blur">
          <div className="absolute -top-14 left-1/2 h-28 w-28 -translate-x-1/2 rounded-full border-2 border-white/10 bg-white p-2 shadow-xl">
            <img
              src={logo}
              alt="Wise Beginning logo"
              className="h-full w-full rounded-full object-contain"
            />
          </div>

          <h1 className="mt-1 text-2xl font-semibold text-white">Wise Beginning</h1>
          <p className="mt-1 text-sm text-slate-300">Sign in to continue.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left" noValidate>
            <div>
              <label htmlFor="identifier" className="block text-sm font-medium text-slate-200">
                Email or Username
              </label>
              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                placeholder="admin@school.mw or your username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-200">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-rose-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <InstallButton />
          <IosInstallHint />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Trouble signing in? Contact your school administrator.
        </p>
      </div>
    </div>
  )
}
