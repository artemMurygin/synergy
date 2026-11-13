import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('manifest', () => {
  it('does not require extra permissions to open the portal in a tab', () => {
    const source = readFileSync('manifest.config.ts', 'utf8')
    const match = /permissions:\s*\[([^\]]*)\]/.exec(source)
    const permissions = (match?.[1] ?? '').split(',').map((item) => item.trim().replace(/'/g, ''))
    expect(permissions.filter(Boolean)).toEqual(['storage', 'sidePanel', 'notifications', 'alarms'])
    expect(permissions).not.toContain('tabs')
  })
})
