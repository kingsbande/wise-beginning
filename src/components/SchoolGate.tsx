import { ReactNode } from 'react'
import { useSchool } from '../context/SchoolContext'

// SchoolGate renders outside AuthProvider, so it must not use components or hooks
// that need auth (LoadingScreen calls useAuth). This spinner depends on nothing.
function GateLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-rose-900"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-rose-400" />
      <span className="sr-only">Loading</span>
    </div>
  )
}

const MESSAGES = {
  no_slug: {
    title: 'Open your school’s link',
    body: 'This address does not point to a school. Use the link your school gave you.',
  },
  not_found: {
    title: 'School not found',
    body: 'We could not find this school. Check the link you were given, or contact your school.',
  },
  error: {
    title: 'Could not load the school',
    body: 'Please check your internet connection and try again.',
  },
} as const

export function SchoolGate({ children }: { children: ReactNode }) {
  const school = useSchool()

  if (school.status === 'loading') return <GateLoading />
  if (school.status === 'ready') return <>{children}</>

  const message = MESSAGES[school.status]

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-rose-900 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur">
        <h1 className="text-xl font-semibold text-white">{message.title}</h1>
        <p className="mt-2 text-sm text-slate-300">{message.body}</p>
        {school.status === 'error' && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 min-h-11 w-full rounded-lg bg-rose-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
