import { LayoutModeProvider } from '@synergy/ui-kit'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/shared/styles.css'
import { AuthGate } from '@/shared/auth/ui'
import { App } from './App'

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <LayoutModeProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </LayoutModeProvider>
    </StrictMode>,
  )
}
