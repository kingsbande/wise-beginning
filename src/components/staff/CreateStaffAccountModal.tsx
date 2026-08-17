import { FormEvent, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'

interface CreateStaffAccountModalProps {
  onClose: () => void
  onCreated: () => void
}

export function CreateStaffAccountModal({ onClose, onCreated }: CreateStaffAccountModalProps) {
  const queryClient = useQueryClient()
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'teacher' | 'headteacher'>('teacher')
  const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string } | null>(
    null,
  )

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-staff-account', {
        body: { full_name: fullName.trim(), role },
      })
      if (error || !data || data.error) {
        throw new Error(data?.error ?? error?.message ?? 'Could not create staff account.')
      }
      return data as { username: string; temporary_password: string }
    },
    onSuccess: (data) => {
      setCredentials({ username: data.username, temporaryPassword: data.temporary_password })
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      onCreated()
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (fullName.trim() === '') return
    createMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        {credentials ? (
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">Staff Account Created</h3>
            <p className="mt-2 text-sm text-gray-600">
              Share these credentials directly with them — they'll be asked to change the password
              on first login.
            </p>
            <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-4 text-left text-sm">
              <p>
                <span className="font-medium text-gray-700">Username:</span> {credentials.username}
              </p>
              <p>
                <span className="font-medium text-gray-700">Temporary Password:</span>{' '}
                {credentials.temporaryPassword}
              </p>
            </div>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Create Staff Account</h3>
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-900">
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Full Name</label>
                <input
                  required
                  autoFocus
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Yona yiwombe"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Their login username is generated from this name.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'teacher' | 'headteacher')}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                >
                  <option value="teacher">Teacher</option>
                  <option value="headteacher">Headteacher</option>
                </select>
              </div>

              {createMutation.isError && (
                <p className="text-sm text-red-600">{(createMutation.error as Error).message}</p>
              )}

              <button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
