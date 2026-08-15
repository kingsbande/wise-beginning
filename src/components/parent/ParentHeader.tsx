import { LogOut } from 'lucide-react'
import { useParentAuth } from '../../context/ParentAuthContext'
import { MyStudent } from '../../lib/parent/parentApi'

function getInitials(name?: string | null) {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase()
}

export function ParentHeader({ student }: { student: MyStudent | null }) {
  const { parentProfile, signOut } = useParentAuth()

  return (
    <header className="border-b border-slate-800 bg-slate-900">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-3">
          {parentProfile?.school_logo_url && (
            <img
              src={parentProfile.school_logo_url}
              alt="School logo"
              className="h-9 w-9 rounded-full border border-white/10 object-contain"
            />
          )}
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">{parentProfile?.school_name}</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-rose-400">
              Parent Portal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-medium text-white">{student?.full_name ?? '—'}</p>
            <p className="text-xs text-slate-400">{student?.class_name}</p>
          </div>

          {student?.photo_url ? (
            <img
              src={student.photo_url}
              alt={student.full_name}
              className="h-9 w-9 rounded-full border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-600 text-sm font-semibold text-white">
              {getInitials(student?.full_name)}
            </div>
          )}

          <div className="h-6 w-px bg-white/10" />

          <button
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-rose-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
