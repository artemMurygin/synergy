import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter, MemoryRouter } from 'react-router'
import { SessionProvider } from '@/features/auth'
import { AppRoutes } from './router'

export interface AppProps {
  /** Injected in tests; the app creates its own client otherwise. */
  queryClient?: QueryClient
  /** Injected in tests to run in a memory router instead of the browser history. */
  initialEntries?: string[]
}

export default function App({ queryClient, initialEntries }: AppProps) {
  const [client] = useState(() => queryClient ?? new QueryClient())
  const routes = (
    <SessionProvider>
      <AppRoutes />
    </SessionProvider>
  )
  return (
    <QueryClientProvider client={client}>
      {initialEntries ? <MemoryRouter initialEntries={initialEntries}>{routes}</MemoryRouter> : <BrowserRouter>{routes}</BrowserRouter>}
    </QueryClientProvider>
  )
}
