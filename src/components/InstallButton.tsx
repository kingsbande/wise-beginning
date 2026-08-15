import { Download } from 'lucide-react'
import { useInstallPrompt } from '../lib/useInstallPrompt'

export function InstallButton() {
  const { canInstall, promptInstall } = useInstallPrompt()

  if (!canInstall) return null

  return (
    <button
      type="button"
      onClick={promptInstall}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-rose-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
    >
      <Download className="h-4 w-4" />
      Install app
    </button>
  )
}
