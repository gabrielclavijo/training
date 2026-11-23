import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router'
import { AuthProvider } from '../features/auth/AuthProvider'
import { AppRoutes } from './AppRoutes'
import { ThemeProvider } from './theme'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
})

// HashRouter: las rutas van después de "#" (…/training/#/metas), así GitHub Pages
// siempre sirve index.html y no hay errores 404 al recargar.
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
