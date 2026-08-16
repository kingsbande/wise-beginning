import { FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useParentAuth } from '../../context/ParentAuthContext'
import logo from '../../assets/logo.png'

export function ForceChangePassword() {
  const { session, parentProfile, loading, refreshParentProfile } = useParentAuth()
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && (!session || !parentProfile)) {
    return <Navigate to="/parent/login" replace />
  }

  if (!loading && parentProfile && !parentProfile.must_change_password) {
    return <Navigate to="/parent" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setSubmitting(false)
      setError(updateError.message)
      return
    }

    const { error: confirmError } = await supabase.functions.invoke(
      'confirm-parent-password-changed',
      { body: {} },
    )

    setSubmitting(false)

    if (confirmError) {
      setError('Password changed, but something went wrong finishing setup. Please try logging in again.')
      return
    }

    await refreshParentProfile()
    navigate('/parent')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-rose-900 px-4">
      {/* Same decorative wave used on the admin login and dashboard hero, for continuity */}
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
        {/* Card container with anchor positioning */}
        <div className="relative mt-14 rounded-2xl border border-white/10 bg-white/5 p-8 pt-16 text-center shadow-2xl shadow-black/40 backdrop-blur">
          {/* Perfectly centered floating circular logo badge */}
          <div className="absolute -top-14 left-1/2 h-28 w-28 -translate-x-1/2 overflow-hidden rounded-full border-2 border-white/10 bg-white p-2 shadow-xl">
            <img
              src={logo}
              alt="Wise Beginning logo"
              className="h-full w-full rounded-full object-cover"
            />
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-rose-400">
            Parent Portal
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Set a New Password</h1>
          <p className="mt-1 text-sm text-slate-300">
            For your security, please choose a new password before continuing.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left" noValidate>
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-slate-200">
                New Password
              </label>
              <input
                id="newPassword"
                name="newPassword"
                required
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-200">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                required
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
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
              {submitting ? 'Saving…' : 'Save & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
