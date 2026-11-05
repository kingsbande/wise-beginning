import { useSchool } from '../context/SchoolContext'

interface SchoolLogoProps {
  className?: string
}

// Shows the school's logo, or its first letter when no logo is set.
export function SchoolLogo({ className = '' }: SchoolLogoProps) {
  const { logoUrl, name } = useSchool()

  if (logoUrl) {
    return <img src={logoUrl} alt={`${name} logo`} className={className} />
  }
  if (!name) return null

  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center bg-rose-600 font-semibold text-white ${className}`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
