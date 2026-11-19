import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Единый линт клиентских пакетов: ui-kit, manager-helper, control-center.
// backend/ и portal/ вне workspaces и имеют свои конфиги.
const strictRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
  '@typescript-eslint/consistent-type-imports': 'error',
}

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/node_modules/**',
      'backend/**',
      'portal/**',
      'ai-portal/**',
      'design/**',
      'openspec/**',
      'data/**',
      '.claude/**',
      '.agents/**',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, chrome: 'readonly' },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...strictRules,
    },
  },
  {
    // CC: иконки только из `@synergy/ui-kit/icons`, примитивы и пакет только через публичный API (D5, D15).
    files: ['control-center/src/renderer/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react',
              message: 'Иконки берутся из @synergy/ui-kit/icons.',
            },
            {
              name: 'radix-ui',
              message: 'Примитивы берутся из @synergy/ui-kit.',
            },
          ],
          patterns: [
            {
              group: ['@radix-ui/*'],
              message: 'Примитивы берутся из @synergy/ui-kit.',
            },
            {
              group: ['@synergy/ui-kit/src/*', '**/ui-kit/src/*'],
              message: 'Глубокие импорты пакета запрещены: используйте @synergy/ui-kit.',
            },
          ],
        },
      ],
    },
  },
  {
    // MH: иконки только из `@synergy/ui-kit/icons`, пакет только через публичный API (D5, D15).
    files: ['manager-helper/src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react',
              message: 'Иконки берутся из @synergy/ui-kit/icons.',
            },
          ],
          patterns: [
            {
              group: ['@synergy/ui-kit/src/*', '**/ui-kit/src/*'],
              message: 'Глубокие импорты пакета запрещены: используйте @synergy/ui-kit.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.config.ts', '**/*.config.mjs', '**/scripts/**'],
    ...tseslint.configs.disableTypeChecked,
  },
)
