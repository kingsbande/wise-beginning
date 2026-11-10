import { ReactNode } from 'react'
import { FeatureName, useFeatures } from '../context/FeaturesContext'
import { FeatureDisabled } from './FeatureDisabled'
import { LoadingScreen } from './LoadingScreen'

export function FeatureRoute({ name, children }: { name: FeatureName; children: ReactNode }) {
  const { ready, isEnabled } = useFeatures()
  if (!ready) return <LoadingScreen />
  return isEnabled(name) ? <>{children}</> : <FeatureDisabled />
}