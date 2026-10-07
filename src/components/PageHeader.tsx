import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  /** Optional toolbar content placed at the end of the header (search, filters, action buttons). */
  children?: ReactNode
}

/**
 * Standard page chrome used across the admin parent surfaces: a title with an
 * optional description on the left, and any toolbar actions on the right.
 * Styling comes from the shared `@layer components` classes in index.css so
 * every heading stays on the design system's tokens.
 */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-header-title">{title}</h1>
        {description && <p className="page-header-description">{description}</p>}
      </div>
      {children && <div className="page-header-actions">{children}</div>}
    </div>
  )
}
