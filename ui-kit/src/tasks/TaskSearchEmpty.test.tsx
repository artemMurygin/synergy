import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TaskSearchEmpty } from './TaskSearchEmpty'

describe('TaskSearchEmpty', () => {
  it('тексты и сброс фильтров', async () => {
    const onReset = vi.fn()
    render(<TaskSearchEmpty onReset={onReset} />)
    expect(screen.getByText('Ничего не найдено')).toBeTruthy()
    expect(screen.getByText('Измените фильтры или поисковый запрос')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
