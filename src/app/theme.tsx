import type { ReactNode } from 'react'

/**
 * La app usa solo tema claro (decisión de diseño). Se conserva el proveedor para
 * no tocar el árbol de la app.
 */
export function ThemeProvider({ children }: { children: ReactNode; onPersist?: (p: 'light' | 'dark' | 'system') => void }) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = 'light'
  return <>{children}</>
}
