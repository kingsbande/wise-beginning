export function getUserFriendlyError(error: unknown, fallback: string): string {
  const technicalMessage = error instanceof Error ? error.message.toLowerCase() : ''

  if (!technicalMessage || technicalMessage.includes('failed to fetch') || technicalMessage.includes('network')) {
    return 'We could not connect to the service. Please check your connection and try again.'
  }

  if (technicalMessage.includes('invalid login') || technicalMessage.includes('invalid email') || technicalMessage.includes('invalid credentials')) {
    return 'The sign-in details are incorrect. Please check them and try again.'
  }

  if (technicalMessage.includes('duplicate') || technicalMessage.includes('already exists') || technicalMessage.includes('unique constraint')) {
    return 'This record already exists. Please check the information and try again.'
  }

  if (technicalMessage.includes('permission') || technicalMessage.includes('not authorized') || technicalMessage.includes('row-level security')) {
    return 'You do not have permission to perform this action.'
  }

  if (technicalMessage.includes('upload') || technicalMessage.includes('image') || technicalMessage.includes('file')) {
    return 'The file could not be uploaded. Please check the file and try again.'
  }

  if (technicalMessage.includes('timeout') || technicalMessage.includes('temporarily unavailable')) {
    return 'The service is temporarily unavailable. Please try again shortly.'
  }

  return fallback
}
