import { ParentAccountsList } from '../components/ParentAccountsList'

export function ParentAccounts({ initialSearch }: { initialSearch?: string } = {}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6 sm:py-8">
      <ParentAccountsList initialSearch={initialSearch} />
    </div>
  )
}
