import { createContext, useContext, type ReactNode } from 'react'
import { useViewportWidth } from './use-viewport-width'

export type LayoutMode = 'desktop' | 'tablet' | 'mobile'

export const WIDE_BREAKPOINT = 640

export function layoutModeForWidth(width: number): LayoutMode {
  return width >= WIDE_BREAKPOINT ? 'tablet' : 'mobile'
}

const LayoutModeContext = createContext<LayoutMode | null>(null)

function WidthDrivenProvider({ children }: { children: ReactNode }) {
  const width = useViewportWidth()
  return <LayoutModeContext value={layoutModeForWidth(width)}>{children}</LayoutModeContext>
}

/** Без `mode` режим считается по ширине окна; с `mode` зафиксирован (CC: desktop). */
export function LayoutModeProvider({ mode, children }: { mode?: LayoutMode; children: ReactNode }) {
  if (mode !== undefined) {
    return <LayoutModeContext value={mode}>{children}</LayoutModeContext>
  }
  return <WidthDrivenProvider>{children}</WidthDrivenProvider>
}

export function useLayoutMode(): LayoutMode {
  const mode = useContext(LayoutModeContext)
  if (mode === null) throw new Error('useLayoutMode must be used inside LayoutModeProvider')
  return mode
}

/** Режим без исключения: `null`, когда провайдера нет (компонент пакета в тесте или в чужом дереве). */
export function useOptionalLayoutMode(): LayoutMode | null {
  return useContext(LayoutModeContext)
}
