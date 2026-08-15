import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { searchStudentsForPicker } from '../lib/queries'
import { useDebouncedValue } from '../lib/useDebouncedValue'

interface CreateParentAccountModalProps {
  onClose: () => void
  onCreated: () => void
}

export function CreateParentAccountModal({ onClose, onCreated }: CreateParentAccountModalProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [credentials, setCredentials] = useState<{
    studentName: string
    username: string
    temporaryPassword: string
    schoolCode: string
  } | null>(null)

  // Only ever fetches a capped, search-filtered slice of students —
  // never the whole table — and is cached per search term so
  // retyping the same query doesn't refire the request.
  const { data: students = [], isLoading } = useQuery({
    queryKey: ['student-picker', debouncedSearch],
    queryFn: () => searchStudentsForPicker(debouncedSearch),
  })

  const createMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const { data, error } = await supabase.functions.invoke('create-parent-account', {
        body: { student_id: studentId },
      })
      if (error || !data || data.error) {
        throw new Error(data?.error ?? error?.message ?? 'Could not create parent account.')
      }
      return data as { username: string; temporary_password: string; school_code: string }
    },
    onSuccess: (data, studentId) => {
      const student = students.find((s) => s.id === studentId)
      setCredentials({
        studentName: student?.full_name ?? 'this student',
        username: data.username,
        temporaryPassword: data.temporary_password,
        schoolCode: data.school_code,
      })
      queryClient.invalidateQueries({ queryKey: ['student-picker'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      onCreated()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
        {credentials ? (
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900">Parent Account Created</h3>
            <p className="mt-2 text-sm text-gray-600">
              For {credentials.studentName}'s parent. Share these credentials directly with them —
              they'll be asked to change the password on first login.
            </p>
            <div className="mt-4 space-y-2 rounded-lg bg-gray-50 p-4 text-left text-sm">
              <p>
                <span className="font-medium text-gray-700">School Code:</span> {credentials.schoolCode}
              </p>
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
              <h3 className="text-lg font-semibold text-gray-900">Select a Student</h3>
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-900">
                Close
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Search by student name, parent name, or admission number.
            </p>

            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />

            {createMutation.isError && (
              <p className="mt-2 text-sm text-red-600">{(createMutation.error as Error).message}</p>
            )}

            <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-gray-100">
              {isLoading ? (
                <p className="p-4 text-sm text-gray-500">Loading students...</p>
              ) : students.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">
                  {search.trim() === '' ? 'Start typing to search for a student.' : 'No students found.'}
                </p>
              ) : (
                students.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.full_name}</p>
                      <p className="text-xs text-gray-500">
                        {s.class_name} · Parent: {s.parent_name} · Adm No: {s.admission_number}
                      </p>
                    </div>
                    {s.parent_account_id ? (
                      <span className="text-xs text-gray-400">Already has an account</span>
                    ) : (
                      <button
                        onClick={() => createMutation.mutate(s.id)}
                        disabled={createMutation.isPending}
                        className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        {createMutation.isPending && createMutation.variables === s.id
                          ? 'Creating...'
                          : 'Create Account'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
