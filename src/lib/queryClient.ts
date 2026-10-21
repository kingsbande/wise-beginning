import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000, // 5 minutes — data stays fresh, no unnecessary refetches
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})
