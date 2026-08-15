import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { fetchParentAccountsPage, PAGE_SIZE } from '../lib/queries'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { ParentAccount } from '../types'
import { SearchBar } from './SearchBar'
import { CreateParentAccountModal } from './CreateParentAccountModal'
import { ConfirmDialog } from './ConfirmDialog'
import { Pagination } from './Pagination'

async function invokeOrThrow<T>(functionName: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, { body })
  if (error || !data || data.error) {
    throw new Error(data?.error ?? error?.message ?? `${functionName} failed`)
  }
  return data as T
}

export function ParentAccountsList() {
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(0)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newPassword, setNewPassword] = useState<{ username: string; password: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ParentAccount | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['parent-accounts', page, debouncedSearch],
    queryFn: () => fetchParentAccountsPage({ page, search: debouncedSearch }),
    placeholderData: (previousData) => previousData,
  })

  const accounts = data?.accounts ?? []
  const total = data?.total ?? 0

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['parent-accounts'] })
  }

  const resetPasswordMutation = useMutation({
    mutationFn: (account: ParentAccount) =>
      invokeOrThrow<{ temporary_password: string }>('reset-parent-password', {
        parent_account_id: account.id,
      }).then((result) => ({ account, result })),
    onSuccess: ({ account, result }) => {
      setNewPassword({ username: account.username, password: result.temporary_password })
      invalidate()
    },
    onError: (err: Error) => setActionError(err.message),
  })

  const toggleStatusMutation = useMutation({
    mutationFn: (account: ParentAccount) =>
      invokeOrThrow('toggle-parent-account-status', {
        parent_account_id: account.id,
        activate: !account.is_active,
      }),
    onSuccess: invalidate,
    onError: (err: Error) => setActionError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (account: ParentAccount) =>
      invokeOrThrow('delete-parent-account', { parent_account_id: account.id }),
    onSuccess: () => {
      invalidate()
      setPendingDelete(null)
    },
    onError: (err: Error) => setActionError(err.message),
  })

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Parent Accounts</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(0)
            }}
            placeholder="Search by name, username, or phone..."
          />
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
          >
            Create Parent Account
          </button>
        </div>
      </div>

      {actionError && <p className="mb-3 text-sm text-rose-600">{actionError}</p>}

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading parent accounts...</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-slate-500">No parent accounts found.</p>
      ) : (
        <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Username</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{a.full_name}</td>
                    <td className="py-2 pr-4">{a.username}</td>
                    <td className="py-2 pr-4">{a.phone ?? '-'}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          a.is_active
                            ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700'
                            : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500'
                        }
                      >
                        {a.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => {
                            setActionError(null)
                            resetPasswordMutation.mutate(a)
                          }}
                          disabled={resetPasswordMutation.isPending}
                          className="text-xs font-medium text-slate-600 underline hover:text-slate-900 disabled:opacity-50"
                        >
                          Reset Password
                        </button>
                        <button
                          onClick={() => {
                            setActionError(null)
                            toggleStatusMutation.mutate(a)
                          }}
                          disabled={toggleStatusMutation.isPending}
                          className="text-xs font-medium text-amber-600 underline hover:text-amber-800 disabled:opacity-50"
                        >
                          {a.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button
                          onClick={() => {
                            setActionError(null)
                            setPendingDelete(a)
                          }}
                          className="text-xs font-medium text-rose-600 underline hover:text-rose-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      )}

      {showCreateModal && (
        <CreateParentAccountModal onClose={() => setShowCreateModal(false)} onCreated={invalidate} />
      )}

      {newPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">Password Reset</h3>
            <p className="mt-2 text-sm text-slate-600">
              Share this new temporary password with {newPassword.username} directly.
            </p>
            <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
              <p>
                <span className="font-medium text-slate-700">Temporary Password:</span>{' '}
                {newPassword.password}
              </p>
            </div>
            <button
              onClick={() => setNewPassword(null)}
              className="mt-6 w-full rounded-lg bg-rose-600 py-2 text-sm font-medium text-white hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete Parent Account"
          message={`Permanently delete the login for ${pendingDelete.full_name} (${pendingDelete.username})? This cannot be undone.`}
          confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => deleteMutation.mutate(pendingDelete)}
        />
      )}
    </div>
  )
}
