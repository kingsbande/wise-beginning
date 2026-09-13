import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useParentAuth } from '../../context/ParentAuthContext'
import { MyStudent } from '../../lib/parent/parentApi'

function getInitials(name?: string | null) {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase()
}

interface ParentHeaderProps {
  student: MyStudent | null
  isSidebarCollapsed: boolean
  isMobileMenuOpen: boolean
  onToggleSidebar: () => void
  onOpenMobileMenu: () => void
}

export function ParentHeader({
  student,
  isSidebarCollapsed,
  isMobileMenuOpen,
  onToggleSidebar,
  onOpenMobileMenu,
}: ParentHeaderProps) {
  const { parentProfile, signOut } = useParentAuth()

  return (
    <header className="border-b border-slate-200 bg-slate-950 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.85)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            aria-expanded={isMobileMenuOpen}
            aria-controls="parent-sidebar"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/10 text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="hidden h-10 w-10 flex-none items-center justify-center rounded-full border border-white/10 text-slate-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 lg:flex"
          >
            {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          {parentProfile?.school_logo_url && (
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 shadow-inner shadow-white/10">
              <img
                src={parentProfile.school_logo_url}
                alt="School logo"
                className="h-full w-full object-contain"
              />
            </div>
          )}
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">{parentProfile?.school_name}</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-rose-300">
              Parent Portal
            </p>
          </div>
        </div>

          <div className="flex flex-none items-center gap-2 sm:gap-4">
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-semibold text-white">{student?.full_name ?? '—'}</p>
            <p className="text-xs text-slate-400">{student?.class_name}</p>
          </div>

          <div className="flex items-center gap-2">
            {student?.photo_url ? (
              <img
                src={student.photo_url}
                alt={student.full_name}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-orange-400 text-sm font-semibold text-white shadow-sm shadow-rose-900/40">
                {getInitials(student?.full_name)}
              </div>
            )}
          </div>

            <button
              type="button"
            onClick={signOut}
              aria-label="Sign out"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-slate-200 transition hover:border-rose-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 sm:hidden"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={signOut}
              className="hidden items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-rose-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 sm:flex"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
