import { createContext, useContext, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

export type FeatureName =
  | 'attendance'
  | 'fees'
  | 'grades'
  | 'weekly_assessments'
  | 'curriculum_topics'
  | 'promotions'
  | 'progress_reports'
  | 'parent_portal'
  | 'staff_records'
  | 'sms_notifications'

interface SchoolFeatureRow {
  features: Record<string, boolean>
  settings: Record<string, unknown>
}

interface FeaturesContextValue {
  // False while the first load for a signed-in user is still running.
  ready: boolean
  isEnabled: (name: FeatureName) => boolean
  setting: (key: string) => unknown
}

const FeaturesContext = createContext<FeaturesContextValue | undefined>(undefined)

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id

  const { data, isFetched } = useQuery({
    queryKey: ['school-features', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<SchoolFeatureRow | null> => {
      const { data, error } = await supabase
        .from('school_features')
        .select('features, settings')
        .maybeSingle()
      if (error) throw error
      return data as SchoolFeatureRow | null
    },
  })

  const value: FeaturesContextValue = {
    ready: !userId || isFetched,
    // No row, or the row could not be loaded: treat everything as enabled so an
    // existing school is never locked out. A real row decides each feature.
    isEnabled: (name) => (data ? data.features[name] === true : true),
    setting: (key) => data?.settings?.[key],
  }

  return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>
}

export function useFeatures() {
  const ctx = useContext(FeaturesContext)
  if (!ctx) throw new Error('useFeatures must be used within FeaturesProvider')
  return ctx
}

export function useFeature(name: FeatureName) {
  return useFeatures().isEnabled(name)
}

export function Feature({
  name,
  children,
  fallback = null,
}: {
  name: FeatureName
  children: ReactNode
  fallback?: ReactNode
}) {
  return <>{useFeature(name) ? children : fallback}</>
}
