import { supabase } from './supabaseClient'
import { CurriculumTopic, CurriculumTopicProgress, Term } from '../types'

export async function fetchTerms(): Promise<Term[]> {
  const { data, error } = await supabase
    .from('terms')
    .select('id, academic_year, name')
    .order('academic_year', { ascending: false })
    .order('name')

  if (error) throw error
  return (data ?? []) as Term[]
}

export async function fetchCurriculumTopics(params: {
  teacherId: string
  classId: string
  subjectId: string
  termId: string
}): Promise<CurriculumTopic[]> {
  const { data, error } = await supabase
    .from('curriculum_topics')
    .select('*')
    .eq('teacher_id', params.teacherId)
    .eq('class_id', params.classId)
    .eq('subject_id', params.subjectId)
    .eq('term_id', params.termId)
    .order('completed')
    .order('created_at')

  if (error) throw error
  return (data ?? []) as CurriculumTopic[]
}

export async function fetchCurriculumTopicsForAdmin(termId: string): Promise<CurriculumTopic[]> {
  const { data, error } = await supabase
    .from('curriculum_topics')
    .select('*')
    .eq('term_id', termId)
    .order('completed')
    .order('created_at')

  if (error) throw error
  return (data ?? []) as CurriculumTopic[]
}

export async function createCurriculumTopic(params: {
  schoolId: string
  teacherId: string
  classId: string
  subjectId: string
  termId: string
  title: string
}): Promise<CurriculumTopic> {
  const { data, error } = await supabase
    .from('curriculum_topics')
    .insert({
      school_id: params.schoolId,
      teacher_id: params.teacherId,
      class_id: params.classId,
      subject_id: params.subjectId,
      term_id: params.termId,
      title: params.title.trim(),
    })
    .select()
    .single()

  if (error) throw error
  return data as CurriculumTopic
}

export async function updateCurriculumTopic(
  id: string,
  changes: Partial<Pick<CurriculumTopic, 'title' | 'note' | 'taught_on' | 'completed'>>,
): Promise<void> {
  const { error } = await supabase
    .from('curriculum_topics')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

export async function deleteCurriculumTopic(id: string): Promise<void> {
  const { error } = await supabase.from('curriculum_topics').delete().eq('id', id)
  if (error) throw error
}

export async function fetchCurriculumProgress(termId: string): Promise<CurriculumTopicProgress[]> {
  const { data, error } = await supabase
    .from('curriculum_topic_progress')
    .select('*')
    .eq('term_id', termId)
    .order('teacher_name')
    .order('class_name')
    .order('subject_name')

  if (error) throw error
  return (data ?? []) as CurriculumTopicProgress[]
}