import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RestoringScreen } from './RestoringScreen'

describe('RestoringScreen', () => {
  it('announces session restore as a status', () => {
    render(<RestoringScreen footer={<span>Сервер: x</span>} />)
    expect(screen.getByRole('status').textContent).toContain('Восстанавливаем сессию')
    expect(screen.getByText('Сервер: x')).toBeTruthy()
  })
})
