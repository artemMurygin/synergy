import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from './pagination'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

describe('Pagination', () => {
  it('shows the range and disables "Назад" on the first page', () => {
    render(<Pagination page={0} pageSize={20} total={134} onPageChange={() => {}} />)
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Показано 1–20 из 134')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Назад' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Вперёд' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows a middle range with both buttons enabled', () => {
    render(<Pagination page={1} pageSize={20} total={134} onPageChange={() => {}} />)
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Показано 21–40 из 134')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Назад' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('clamps the last range to the total and disables "Вперёд"', () => {
    render(<Pagination page={6} pageSize={20} total={134} onPageChange={() => {}} />)
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Показано 121–134 из 134')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Вперёд' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Назад' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('reports the zero-based target page', async () => {
    const onPageChange = vi.fn()
    render(<Pagination page={1} pageSize={20} total={134} onPageChange={onPageChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Вперёд' }))
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(onPageChange).toHaveBeenNthCalledWith(1, 2)
    expect(onPageChange).toHaveBeenNthCalledWith(2, 0)
  })

  it('is a navigation landmark named "Страницы"', () => {
    render(<Pagination page={0} pageSize={20} total={50} onPageChange={() => {}} />)
    expect(screen.getByRole('navigation', { name: 'Страницы' })).toBeTruthy()
  })

  it('renders nothing when everything fits on one page', () => {
    const { container } = render(<Pagination page={0} pageSize={20} total={20} onPageChange={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('uses 44px buttons and no top border on narrow screens, 36px from sm, no border at any width', () => {
    render(<Pagination page={1} pageSize={20} total={134} onPageChange={() => {}} />)
    const nav = screen.getByRole('navigation', { name: 'Страницы' })
    expect(nav.className).toContain('gap-2.5')
    expect(nav.className).not.toMatch(/(^|\s)border-t(\s|$)/)
    expect(nav.className).not.toContain('border-t')
    for (const name of ['Назад', 'Вперёд']) {
      const b = screen.getByRole('button', { name })
      expect(b.className).toContain('h-11')
      expect(b.className).toContain('sm:h-9')
    }
  })

  it('matches Pagination / Master: 14px label, r-md radius, 0 14 padding, 16px icons', () => {
    render(<Pagination page={1} pageSize={20} total={134} onPageChange={() => {}} />)
    for (const name of ['Назад', 'Вперёд']) {
      const b = screen.getByRole('button', { name })
      expect(b.className).toContain('rounded-md')
      expect(b.className).toContain('text-sm')
      expect(b.className).toContain('px-3.5')
      expect(b.className).not.toContain('rounded-lg')
      expect(b.querySelector('svg')?.getAttribute('class')).toContain('size-4')
    }
  })
})
