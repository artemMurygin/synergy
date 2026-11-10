import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/raleway'
import '@fontsource-variable/onest'
import '@/shared/styles.css'
import { AuthGate } from '@/shared/auth/ui'
import { App } from './App'

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <AuthGate>
        <App />
      </AuthGate>
    </StrictMode>,
  )
}
