import { useAuth } from '../context/AuthContext'
import logoImage from '../assets/logo.png'

export function LoadingScreen() {
  const { profile } = useAuth()

  return (
    <div className="relative flex h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-rose-200/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-64 w-64 rounded-full bg-slate-300/20 blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative flex flex-col items-center gap-8">
        {/* Loading badge */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg">
          <img src={logoImage} alt="Logo" className="h-12 w-12 object-contain" />
        </div>

        {/* Text */}
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-slate-900">
            {profile?.school_name ?? 'School Portal'}
          </h2>
          <p className="mt-2 text-sm text-slate-500">Setting up your dashboard...</p>
        </div>

        {/* Animated spinner */}
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
          <div
            className="absolute inset-0 rounded-full border-4 border-transparent border-t-rose-600 border-r-rose-600 animate-spin"
            style={{
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>

        {/* Loading text */}
        <p className="text-sm font-medium text-slate-600">
          Loading<span className="animate-pulse">...</span>
        </p>
      </div>

      <style>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
