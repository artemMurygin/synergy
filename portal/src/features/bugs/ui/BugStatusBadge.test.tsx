import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BugStatusBadge } from './BugStatusBadge'

afterEach(cleanup)

describe('BugStatusBadge', () => {
  it.each([
    ['open', 'Открыт', 'bg-warning/15'],
    ['in_progress', 'В работе', 'bg-info-soft'],
    ['resolved', 'Исправлен', 'bg-success-soft'],
    ['wont_fix', 'Не будет исправлен', 'bg-surface-sunken']
  ] as const)('shows %s as "%s" in its tone', (status, label, toneClass) => {
    render(<BugStatusBadge status={status} />)
    expect(screen.getByText(label).className).toContain(toneClass)
  })

  it('overrides the text colour of "Открыт" with ink-80', () => {
    render(<BugStatusBadge status="open" />)
    expect(screen.getByText('Открыт').className).toContain('text-ink-80')
  })
})
