import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RestoringScreen } from './RestoringScreen'

describe('RestoringScreen', () => {
  afterEach(cleanup)

  it('renders the frame title at 22px with its caption', () => {
    render(<RestoringScreen />)
    expect(screen.getByText('Восстанавливаем сессию').className).toContain('text-[22px]')
    expect(screen.getByText('Проверяем сохранённый вход.')).toBeTruthy()
  })
})
