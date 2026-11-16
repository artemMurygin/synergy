import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RequestStatusBadge } from './RequestStatusBadge'

afterEach(cleanup)

describe('RequestStatusBadge', () => {
  it.each([
    ['new', 'Новая'],
    ['under_review', 'На рассмотрении'],
    ['rejected', 'Отклонена'],
    ['planned', 'Запланировано'],
    ['in_dev', 'В разработке'],
    ['testing', 'Тестируется'],
    ['launched', 'Запущено']
  ] as const)('shows %s as "%s"', (status, label) => {
    render(<RequestStatusBadge status={status} />)
    expect(screen.getByText(label)).toBeTruthy()
  })

  it('colours "new" grey and "under_review" purple, with a coloured dot', () => {
    render(<RequestStatusBadge status="new" />)
    const grey = screen.getByText('Новая')
    expect(grey.className).toContain('bg-surface-sunken')
    expect(grey.className).toContain('[&>span:first-child]:bg-ink-40')
    cleanup()
    render(<RequestStatusBadge status="under_review" />)
    const purple = screen.getByText('На рассмотрении')
    expect(purple.className).toContain('bg-purple-soft')
    expect(purple.className).toContain('[&>span:first-child]:bg-accent-purple')
  })
})
