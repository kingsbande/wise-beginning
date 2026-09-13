import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000, // 5 minutes — data stays fresh, no unnecessary refetches
      refetchOnWindowFocus: false, // don't re-fetch when switching back to the app
      retry: 1,
    },
  },
})
