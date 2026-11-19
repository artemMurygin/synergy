import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('manifest', () => {
  it('requires only downloads on top of the base permissions and no tabs', () => {
    const source = readFileSync('manifest.config.ts', 'utf8')
    const match = /permissions:\s*\[([^\]]*)\]/.exec(source)
    const permissions = (match?.[1] ?? '').split(',').map((item) => item.trim().replace(/'/g, ''))
    expect(permissions.filter(Boolean)).toEqual(['storage', 'sidePanel', 'notifications', 'alarms', 'downloads'])
    expect(permissions).not.toContain('tabs')
  })
})
