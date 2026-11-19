import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const read = (name: string) => readFileSync(join(here, name), 'utf8')

// Снимок переменных design/design-kit.lib.pen (GetVariables), имена без префикса `t:`.
const KIT_COLORS = [
  'surface', 'border', 'accent-blue', 'ink', 'ink-60', 'brand-red', 'ink-40', 'surface-alt',
  'ink-80', 'surface-sunken', 'border-strong', 'shadow-red', 'brand-red-soft', 'brand-red-hover',
  'success', 'info', 'shadow-card', 'info-soft', 'warning', 'warning-soft', 'success-soft',
]
const KIT_RADII = ['2xl', 'pill', 'md', 'lg', 'sm', 'xl']
const KIT_FONTS = ['ui', 'display']
// Производные токены UI Kit для чата и панелей.
const EXTRA = ['--font-chat', '--font-mono', '--shadow-panel']

const expected = [
  ...KIT_COLORS.map((n) => `--color-${n}`),
  ...KIT_RADII.map((n) => `--radius-${n}`),
  ...KIT_FONTS.map((n) => `--font-${n}`),
  ...EXTRA,
].sort()

describe('tokens.css', () => {
  const css = read('tokens.css')
  const declared = [...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]).sort()

  it('declares exactly the UI Kit variables without the t: prefix', () => {
    expect(declared).toEqual(expected)
    expect(css).not.toMatch(/--t:|--t-/)
  })

  it('is a light-only theme', () => {
    for (const file of ['tokens.css', 'base.css', 'fonts.css', 'index.css']) {
      const src = read(file)
      expect(src).not.toContain('prefers-color-scheme')
      expect(src).not.toMatch(/\.dark\b/)
    }
  })
})

describe('base.css', () => {
  const css = read('base.css')

  it('sets color-scheme light and the UI font on body outside layers', () => {
    expect(css).toMatch(/color-scheme:\s*light/)
    const withoutLayers = css.replace(/@layer[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
    expect(withoutLayers).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-ui\)/)
  })

  it('styles .markdown', () => {
    expect(css).toContain('.markdown')
  })
})

describe('fonts.css', () => {
  it('imports four fonts locally from fontsource', () => {
    const css = read('fonts.css')
    for (const f of ['raleway', 'onest', 'inter', 'jetbrains-mono']) {
      expect(css).toContain(`@fontsource-variable/${f}`)
    }
    expect(css).not.toMatch(/https?:\/\//)
  })
})
