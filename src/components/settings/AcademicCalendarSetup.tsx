import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import {
  AcademicYearTermInput,
  CalendarTermRecord,
  fetchAcademicYears,
  fetchCalendarTerms,
  saveSchoolAcademicYear,
} from '../../lib/academicCalendarApi'

type TermOrder = 1 | 2 | 3

interface TermFormValue {
  termId: string
  startDate: string
  endDate: string
}

const TERM_ORDERS: TermOrder[] = [1, 2, 3]

function emptyTerms(): Record<TermOrder, TermFormValue> {
  return {
    1: { termId: '', startDate: '', endDate: '' },
    2: { termId: '', startDate: '', endDate: '' },
    3: { termId: '', startDate: '', endDate: '' },
  }
}

function suggestedTerms(terms: CalendarTermRecord[], label: string) {
  const firstYear = label.match(/^(\d{4})\/\d{4}$/)?.[1]
  const result = emptyTerms()

  if (!firstYear) return result

  for (const termOrder of TERM_ORDERS) {
    const termName = `Term ${termOrder}`
    const candidates = terms.filter(
      (term) =>
        term.name.trim() === termName &&
        term.academic_year === firstYear &&
        term.academic_year_id === null,
    )

    if (candidates.length === 1) {
      result[termOrder].termId = candidates[0].id
    }
  }

  return result
}

function legacyAcademicYear(label: string) {
  return label.match(/^(\d{4})\/\d{4}$/)?.[1] ?? ''
}

function dateRangeIsValid(start: string, end: string) {
  return start !== '' && end !== '' && start <= end
}

export function AcademicCalendarSetup() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const schoolId = profile?.school_id
  const initialYear = new Date().getFullYear()
  const initialLabel = `${initialYear}/${initialYear + 1}`

  const [selectedYearId, setSelectedYearId] = useState('')
  const [label, setLabel] = useState(initialLabel)
  const [yearStartDate, setYearStartDate] = useState('')
  const [yearEndDate, setYearEndDate] = useState('')
  const [termValues, setTermValues] = useState(emptyTerms)
  const [validationError, setValidationError] = useState<string | null>(null)

  const yearsQuery = useQuery({
    queryKey: ['academic-years', schoolId],
    queryFn: () => fetchAcademicYears(schoolId!),
    enabled: !!schoolId && profile?.role === 'admin',
  })
  const termsQuery = useQuery({
    queryKey: ['calendar-terms', schoolId],
    queryFn: () => fetchCalendarTerms(schoolId!),
    enabled: !!schoolId && profile?.role === 'admin',
  })

  const years = yearsQuery.data ?? []
  const terms = termsQuery.data ?? []
  const selectedYear = years.find((year) => year.id === selectedYearId) ?? null
  const reviewTerms = terms.filter((term) => {
    if (term.academic_year_id !== null) return false
    const isStandardName = /^Term [123]$/.test(term.name.trim())
    return !isStandardName || term.academic_year !== legacyAcademicYear(label)
  })

  const saveMutation = useMutation({
    mutationFn: saveSchoolAcademicYear,
    onSuccess: async (savedYearId) => {
      setValidationError(null)
      setSelectedYearId(savedYearId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years', schoolId] }),
        queryClient.invalidateQueries({ queryKey: ['calendar-terms', schoolId] }),
        queryClient.invalidateQueries({ queryKey: ['terms'] }),
      ])
    },
  })

  useEffect(() => {
    if (!selectedYear) return
    setLabel(selectedYear.label)
    setYearStartDate(selectedYear.start_date ?? '')
    setYearEndDate(selectedYear.end_date ?? '')

    const selectedTerms = emptyTerms()
    for (const term of terms) {
      if (
        term.academic_year_id === selectedYear.id &&
        term.term_order !== null &&
        TERM_ORDERS.includes(term.term_order as TermOrder)
      ) {
        selectedTerms[term.term_order as TermOrder] = {
          termId: term.id,
          startDate: term.start_date ?? '',
          endDate: term.end_date ?? '',
        }
      }
    }
    setTermValues(selectedTerms)
    setValidationError(null)
  }, [selectedYear, terms])

  const configuredCount = useMemo(
    () =>
      TERM_ORDERS.filter((order) => {
        const term = terms.find(
          (candidate) =>
            candidate.academic_year_id === selectedYearId &&
            candidate.term_order === order &&
            candidate.start_date &&
            candidate.end_date,
        )
        return !!term
      }).length,
    [selectedYearId, terms],
  )

  function startNewYear() {
    setSelectedYearId('')
    setLabel(initialLabel)
    setYearStartDate('')
    setYearEndDate('')
    setTermValues(suggestedTerms(terms, initialLabel))
    setValidationError(null)
    saveMutation.reset()
  }

  function updateTerm(order: TermOrder, patch: Partial<TermFormValue>) {
    setTermValues((current) => ({
      ...current,
      [order]: { ...current[order], ...patch },
    }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setValidationError(null)

    const yearMatch = label.trim().match(/^(\d{4})\/(\d{4})$/)
    if (!yearMatch || Number(yearMatch[2]) !== Number(yearMatch[1]) + 1) {
      setValidationError('Enter consecutive years in the format YYYY/YYYY, for example 2026/2027.')
      return
    }
    if (!dateRangeIsValid(yearStartDate, yearEndDate)) {
      setValidationError('Enter a valid start and end date for the academic year.')
      return
    }

    const submissions: AcademicYearTermInput[] = TERM_ORDERS.map((termOrder) => ({
      term_order: termOrder,
      term_id: termValues[termOrder].termId || null,
      start_date: termValues[termOrder].startDate,
      end_date: termValues[termOrder].endDate,
    }))

    for (const term of submissions) {
      if (!dateRangeIsValid(term.start_date, term.end_date)) {
        setValidationError(`Enter valid start and end dates for Term ${term.term_order}.`)
        return
      }
      if (term.start_date < yearStartDate || term.end_date > yearEndDate) {
        setValidationError(`Term ${term.term_order} dates must fall within the academic year dates.`)
        return
      }
    }

    const mappedTermIds = submissions.flatMap((term) => (term.term_id ? [term.term_id] : []))
    if (new Set(mappedTermIds).size !== mappedTermIds.length) {
      setValidationError('Each term must use a different existing term row.')
      return
    }

    const sortedTerms = [...submissions].sort((a, b) => a.start_date.localeCompare(b.start_date))
    for (let index = 1; index < sortedTerms.length; index += 1) {
      if (sortedTerms[index].start_date <= sortedTerms[index - 1].end_date) {
        setValidationError('Term date ranges must not overlap.')
        return
      }
    }

    saveMutation.mutate({
      academicYearId: selectedYearId || null,
      label: label.trim(),
      startDate: yearStartDate,
      endDate: yearEndDate,
      terms: submissions,
    })
  }

  if (profile?.role !== 'admin') {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Academic calendar setup is available to school administrators.
      </section>
    )
  }

  if (yearsQuery.isError || termsQuery.isError) {
    const error = yearsQuery.error ?? termsQuery.error
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-5">
        <h3 className="font-semibold text-rose-900">Could not load academic calendar setup</h3>
        <p className="mt-1 text-sm text-rose-800">
          {error instanceof Error ? error.message : 'An unexpected error occurred.'}
        </p>
      </section>
    )
  }

  if (yearsQuery.isLoading || termsQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading academic calendar setup...</p>
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Academic Calendar</h3>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Set up an academic year and its three dated terms. Existing terms can be mapped without
            changing their IDs or moving their linked records. Unselected terms are created when you
            save.
          </p>
        </div>
        <button
          type="button"
          onClick={startNewYear}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Set up a new year
        </button>
      </div>

      {years.length > 0 && (
        <div className="mt-5 max-w-md">
          <label htmlFor="calendar-existing-year" className="mb-1 block text-sm font-medium text-gray-700">
            Existing academic year
          </label>
          <select
            id="calendar-existing-year"
            value={selectedYearId}
            onChange={(event) => {
              setSelectedYearId(event.target.value)
              setValidationError(null)
              saveMutation.reset()
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          >
            <option value="">Create a new academic year</option>
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedYearId && (
        <p className="mt-4 text-sm text-slate-600">
          Configured terms: {configuredCount} of 3
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="calendar-year-label" className="mb-1 block text-sm font-medium text-gray-700">
              Academic year
            </label>
            <input
              id="calendar-year-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="2026/2027"
              pattern="[0-9]{4}/[0-9]{4}"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="calendar-year-start" className="mb-1 block text-sm font-medium text-gray-700">
              Academic year starts
            </label>
            <input
              id="calendar-year-start"
              type="date"
              value={yearStartDate}
              onChange={(event) => setYearStartDate(event.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="calendar-year-end" className="mb-1 block text-sm font-medium text-gray-700">
              Academic year ends
            </label>
            <input
              id="calendar-year-end"
              type="date"
              value={yearEndDate}
              onChange={(event) => setYearEndDate(event.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-4">
          {TERM_ORDERS.map((order) => {
            const termName = `Term ${order}`
            const availableTerms = terms.filter(
              (term) =>
                term.name.trim() === termName &&
                (term.academic_year_id === selectedYearId ||
                  (term.academic_year_id === null &&
                    term.academic_year === legacyAcademicYear(label))),
            )

            return (
              <fieldset key={order} className="rounded-lg border border-gray-200 p-4">
                <legend className="px-1 text-sm font-semibold text-gray-900">{termName}</legend>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor={`calendar-term-row-${order}`} className="mb-1 block text-sm font-medium text-gray-700">
                      Existing term row
                    </label>
                    <select
                      id={`calendar-term-row-${order}`}
                      value={termValues[order].termId}
                      onChange={(event) => updateTerm(order, { termId: event.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                    >
                      <option value="">Create a new {termName} row</option>
                      {availableTerms.map((term) => (
                        <option key={term.id} value={term.id}>
                          {term.name} — {term.academic_year}
                          {term.academic_year_id === selectedYearId ? ' (this year)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`calendar-term-start-${order}`} className="mb-1 block text-sm font-medium text-gray-700">
                      Starts
                    </label>
                    <input
                      id={`calendar-term-start-${order}`}
                      type="date"
                      value={termValues[order].startDate}
                      onChange={(event) => updateTerm(order, { startDate: event.target.value })}
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor={`calendar-term-end-${order}`} className="mb-1 block text-sm font-medium text-gray-700">
                      Ends
                    </label>
                    <input
                      id={`calendar-term-end-${order}`}
                      type="date"
                      value={termValues[order].endDate}
                      onChange={(event) => updateTerm(order, { endDate: event.target.value })}
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                    />
                  </div>
                </div>
              </fieldset>
            )
          })}
        </div>

        {reviewTerms.length > 0 && (
          <aside className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <h4 className="text-sm font-semibold text-amber-950">Legacy terms needing review</h4>
            <p className="mt-1 text-sm text-amber-900">
              These rows are not offered for automatic mapping because their names or legacy year
              do not match this academic year. They remain unchanged.
            </p>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {reviewTerms.map((term) => (
                <li key={term.id}>
                  {term.name} — {term.academic_year}
                </li>
              ))}
            </ul>
          </aside>
        )}

        {validationError && (
          <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
            {validationError}
          </p>
        )}
        {saveMutation.isError && (
          <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : 'Could not save the academic calendar.'}
          </p>
        )}
        {saveMutation.isSuccess && (
          <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            Academic year and all three terms saved.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving calendar...' : selectedYearId ? 'Save calendar' : 'Create academic year'}
          </button>
          <span className="text-xs text-gray-500">
            Dates are required. Terms must be inside the academic year and must not overlap.
          </span>
        </div>
      </form>
    </section>
  )
}
