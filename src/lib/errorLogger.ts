import { supabase } from './supabaseClient'

interface ErrorLogDetails {
  type: string
  page?: string
  context?: Record<string, unknown>
}

export async function logError(error: unknown, details: ErrorLogDetails): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)

  console.error(`[${details.type}]`, error)

  try {
    await supabase.functions.invoke('log-error', {
      body: {
        error_type: details.type,
        message,
        page: details.page ?? window.location.pathname,
        context: details.context ?? null,
      },
    })
  } catch (loggingError) {
    console.warn('Could not send error log:', loggingError)
  }
}
