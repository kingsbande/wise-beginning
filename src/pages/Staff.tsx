import { StaffList } from '../components/staff/StaffList'

export function Staff({ initialSearch }: { initialSearch?: string } = {}) {
  return (
    <div className="page-container">
      <StaffList initialSearch={initialSearch} />
    </div>
  )
}
