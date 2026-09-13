import { supabase } from './supabaseClient'

export interface GlobalSearchResult {
  id: string
  label: string
  subtitle: string
}

export interface GlobalSearchResults {
  students: GlobalSearchResult[]
  parents: GlobalSearchResult[]
  staff: GlobalSearchResult[]
}

// Same reasoning as sanitizeForOrFilter in queries.ts — PostgREST's
// `.or()` syntax breaks on raw commas/parentheses in user input.
function sanitizeForOrFilter(term: string): string {
  return term.replace(/[,()]/g, '').trim()
}

// Every query below runs through the normal authenticated client,
// so RLS applies exactly as it does everywhere else in the app —
// an admin sees their whole school, a headteacher only ever gets
// matches from the students table (their own RLS scope), a teacher
// only their assigned classes' students. No new backend logic is
// needed to enforce "only that school" — it's already enforced.
export async function searchEverything(term: string): Promise<GlobalSearchResults> {
  const q = sanitizeForOrFilter(term)
  if (q === '') return { students: [], parents: [], staff: [] }

  const [studentsResult, parentsResult, staffResult] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, admission_number, classes ( name )')
      .or(`full_name.ilike.%${q}%,admission_number.ilike.%${q}%`)
      .limit(5),
    supabase
      .from('parent_accounts')
      .select('id, full_name, username, phone')
      .or(`full_name.ilike.%${q}%,username.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(5),
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['teacher', 'headteacher'])
      .ilike('full_name', `%${q}%`)
      .limit(5),
  ])

  const students = (
    (studentsResult.data ?? []) as unknown as Array<{
      id: string
      full_name: string
      admission_number: string
      classes: { name: string } | null
    }>
  ).map((s) => ({
    id: s.id,
    label: s.full_name,
    subtitle: `Adm No: ${s.admission_number} · ${s.classes?.name ?? 'Unassigned'}`,
  }))

  const parents = (
    (parentsResult.data ?? []) as Array<{
      id: string
      full_name: string
      username: string
      phone: string | null
    }>
  ).map((p) => ({
    id: p.id,
    label: p.full_name,
    subtitle: `@${p.username}${p.phone ? ` · ${p.phone}` : ''}`,
  }))

  const staff = (
    (staffResult.data ?? []) as Array<{ id: string; full_name: string; role: string }>
  ).map((s) => ({
    id: s.id,
    label: s.full_name,
    subtitle: s.role === 'headteacher' ? 'Headteacher' : 'Teacher',
  }))

  return { students, parents, staff }
}
