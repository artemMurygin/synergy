import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RequestStatusBadge } from './RequestStatusBadge'

afterEach(cleanup)

describe('RequestStatusBadge', () => {
  it.each([
    ['pending', 'На рассмотрении'],
    ['rejected', 'Отклонена'],
    ['planned', 'Запланировано'],
    ['in_dev', 'В разработке'],
    ['testing', 'Тестируется'],
    ['launched', 'Запущено']
  ] as const)('shows %s as "%s"', (status, label) => {
    render(<RequestStatusBadge status={status} />)
    expect(screen.getByText(label)).toBeTruthy()
  })
})
