import { StaffList } from '../components/staff/StaffList'

export function Staff({ initialSearch }: { initialSearch?: string } = {}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
      <StaffList initialSearch={initialSearch} />
    </div>
  )
}
