import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // avoid refetching the same data on every tab switch
      retry: 1,
    },
  },
})
