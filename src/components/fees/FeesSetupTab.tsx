import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { fetchClasses } from '../../lib/queries'
import { fetchTerms } from '../../lib/gradesApi'
import {
  addFeeCategory,
  addFeeCategoryItem,
  deleteFeeCategory,
  deleteFeeCategoryItem,
  fetchFeeCategories,
  fetchFeeCategoryItems,
  fetchFeeStructures,
  generateChargesFromStructure,
  upsertFeeStructure,
} from '../../lib/feesApi'

export function FeesSetupTab() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()

  const { data: categories = [] } = useQuery({ queryKey: ['fee-categories'], queryFn: fetchFeeCategories })
  const { data: categoryItems = [] } = useQuery({ queryKey: ['fee-category-items'], queryFn: () => fetchFeeCategoryItems() })
  const { data: classes = [] } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses })
  const { data: terms = [] } = useQuery({ queryKey: ['terms'], queryFn: fetchTerms })
  const { data: structures = [] } = useQuery({ queryKey: ['fee-structures'], queryFn: fetchFeeStructures })

  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryFlexible, setNewCategoryFlexible] = useState(false)
  const [editingItemsCategoryId, setEditingItemsCategoryId] = useState<string | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [structureClassId, setStructureClassId] = useState('')
  const [structureCategoryId, setStructureCategoryId] = useState('')
  const [structureTermId, setStructureTermId] = useState('')
  const [structureAmount, setStructureAmount] = useState('')
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [generateMessage, setGenerateMessage] = useState<string | null>(null)

  const addCategoryMutation = useMutation({
    mutationFn: ({ name, isFlexible }: { name: string; isFlexible: boolean }) =>
      addFeeCategory(profile!.school_id, name, isFlexible),
    onSuccess: () => {
      setNewCategoryName('')
      setNewCategoryFlexible(false)
      queryClient.invalidateQueries({ queryKey: ['fee-categories'] })
    },
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: deleteFeeCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fee-categories'] }),
  })

  const addCategoryItemMutation = useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      addFeeCategoryItem(profile!.school_id, categoryId, name),
    onSuccess: () => {
      setNewItemName('')
      queryClient.invalidateQueries({ queryKey: ['fee-category-items'] })
    },
  })

  const deleteCategoryItemMutation = useMutation({
    mutationFn: deleteFeeCategoryItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fee-category-items'] }),
  })

  const saveStructureMutation = useMutation({
    mutationFn: () =>
      upsertFeeStructure({
        schoolId: profile!.school_id,
        classId: structureClassId,
        feeCategoryId: structureCategoryId,
        termId: structureTermId,
        amount: Number(structureAmount),
      }),
    onSuccess: () => {
      setStructureAmount('')
      queryClient.invalidateQueries({ queryKey: ['fee-structures'] })
    },
  })

  async function handleGenerate(structureId: string) {
    if (!profile) return
    setGeneratingId(structureId)
    setGenerateMessage(null)
    try {
      const count = await generateChargesFromStructure(structureId, profile.school_id)
      setGenerateMessage(`Applied to ${count} student${count === 1 ? '' : 's'}.`)
    } catch (err) {
      setGenerateMessage(err instanceof Error ? err.message : 'Could not generate charges.')
    } finally {
      setGeneratingId(null)
    }
  }

  function handleAddCategory(e: FormEvent) {
    e.preventDefault()
    if (newCategoryName.trim() === '') return
    addCategoryMutation.mutate({ name: newCategoryName.trim(), isFlexible: newCategoryFlexible })
  }

  function handleSaveStructure(e: FormEvent) {
    e.preventDefault()
    if (!structureClassId || !structureCategoryId || !structureTermId || structureAmount === '') return
    saveStructureMutation.mutate()
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-base font-semibold text-gray-900">Fee Categories</h3>
        <p className="mt-1 text-sm text-gray-500">
          School Fees, Uniform Fees, and Books Fees are set up by default — add any others your
          school uses.
        </p>

        <form onSubmit={handleAddCategory} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="e.g. Transport Fees"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={addCategoryMutation.isPending}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Add
          </button>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={newCategoryFlexible}
              onChange={(e) => setNewCategoryFlexible(e.target.checked)}
            />
            Flexible (student-specific)
          </label>
        </form>

        <ul className="mt-3 divide-y divide-gray-100">
          {categories.map((c) => (
            <li key={c.id} className="py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>
                  {c.name}
                  {c.is_flexible && <span className="ml-2 text-xs text-blue-600">Flexible</span>}
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  {c.is_flexible && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItemsCategoryId(editingItemsCategoryId === c.id ? null : c.id)
                        setNewItemName('')
                      }}
                      className="text-xs font-medium text-blue-700 underline hover:text-blue-900"
                    >
                      {editingItemsCategoryId === c.id ? 'Done' : 'Manage items'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteCategoryMutation.mutate(c.id)}
                    className="text-xs font-medium text-red-600 underline hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {c.is_flexible && editingItemsCategoryId === c.id && (
                <div className="mt-2 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">Add the selectable items included in this flexible fee.</p>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (newItemName.trim()) addCategoryItemMutation.mutate({ categoryId: c.id, name: newItemName.trim() })
                    }}
                    className="mt-2 flex gap-2"
                  >
                    <input
                      value={newItemName}
                      onChange={(event) => setNewItemName(event.target.value)}
                      placeholder="e.g. Socks"
                      maxLength={100}
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!newItemName.trim() || addCategoryItemMutation.isPending}
                      className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Add item
                    </button>
                  </form>
                  {addCategoryItemMutation.isError && <p role="alert" className="mt-2 text-xs text-red-600">Could not add this item. It may already exist.</p>}
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {categoryItems.filter((item) => item.fee_category_id === c.id).map((item) => (
                      <li key={item.id} className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700">
                        {item.name}
                        <button
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => deleteCategoryItemMutation.mutate(item.id)}
                          className="font-semibold text-red-600 hover:text-red-800"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-base font-semibold text-gray-900">Fee Structures</h3>
        <p className="mt-1 text-sm text-gray-500">
          Set the standard amount for a class + category + term, then generate it to every student
          in that class at once. Regenerating resets any individually adjusted amounts back to this
          standard rate.
        </p>

        <form onSubmit={handleSaveStructure} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-5">
          <select
            value={structureClassId}
            onChange={(e) => setStructureClassId(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-gray-900 focus:outline-none"
          >
            <option value="">Class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={structureCategoryId}
            onChange={(e) => setStructureCategoryId(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-gray-900 focus:outline-none"
          >
            <option value="">Category</option>
            {categories.filter((c) => !c.is_flexible).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={structureTermId}
            onChange={(e) => setStructureTermId(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-gray-900 focus:outline-none"
          >
            <option value="">Term</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.academic_year}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={structureAmount}
            onChange={(e) => setStructureAmount(e.target.value)}
            placeholder="Amount"
            className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={saveStructureMutation.isPending}
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Save
          </button>
        </form>

        {generateMessage && <p className="mt-3 text-xs text-gray-600">{generateMessage}</p>}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-4">Class</th>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Term</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {structures.map((s) => (
                <tr key={s.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">{s.class_name}</td>
                  <td className="py-2 pr-4">{s.fee_category_name}</td>
                  <td className="py-2 pr-4">{s.term_name}</td>
                  <td className="py-2 pr-4">{s.amount.toLocaleString()}</td>
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => handleGenerate(s.id)}
                      disabled={generatingId === s.id}
                      className="text-xs font-medium text-blue-600 underline hover:text-blue-800 disabled:opacity-50"
                    >
                      {generatingId === s.id ? 'Generating...' : 'Generate Charges'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
