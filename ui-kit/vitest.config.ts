import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'styles/**/*.test.ts'],
    passWithNoTests: true,
    restoreMocks: true,
    setupFiles: ['src/test-setup.ts'],
  },
})
