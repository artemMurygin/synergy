import { LayoutModeProvider } from '@synergy/ui-kit'
import type { ReactNode } from 'react'

/** The container of the section under the fixed desktop layout of the application. */
export function Desktop({ children }: { children: ReactNode }) {
  return <LayoutModeProvider mode="desktop">{children}</LayoutModeProvider>
}
