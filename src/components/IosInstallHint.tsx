import { useEffect, useState } from 'react'
import { Share } from 'lucide-react'

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function isInStandaloneMode() {
  // iOS Safari sets this when the app is already launched from the home screen.
  return 'standalone' in window.navigator && (window.navigator as any).standalone
}

export function IosInstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(isIos() && !isInStandaloneMode())
  }, [])

  if (!show) return null

  return (
    <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
      <Share className="h-3.5 w-3.5" />
      On iPhone: tap Share, then &ldquo;Add to Home Screen&rdquo;
    </p>
  )
}
