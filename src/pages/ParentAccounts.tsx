import { ParentAccountsList } from '../components/ParentAccountsList'

export function ParentAccounts({ initialSearch }: { initialSearch?: string } = {}) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <ParentAccountsList initialSearch={initialSearch} />
    </div>
  )
}
