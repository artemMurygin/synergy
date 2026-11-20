import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Calendar } from './Calendar'

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

function setup(props: Partial<Parameters<typeof Calendar>[0]> = {}) {
  const onChange = vi.fn()
  render(<Calendar value={d(2026, 12, 12)} today={d(2026, 12, 5)} onChange={onChange} {...props} />)
  return { onChange }
}

describe('Calendar', () => {
  it('renders a 7x6 grid for the month in Russian starting from Monday', () => {
    setup()
    expect(screen.getByText(/декабрь 2026/i)).toBeTruthy()
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(heads).toEqual(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'])
    expect(screen.getAllByRole('gridcell')).toHaveLength(42)
    expect(screen.getAllByRole('row')).toHaveLength(7)
  })

  it('marks selected and today', () => {
    setup()
    expect(screen.getByRole('gridcell', { name: /^12 декабря 2026/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('gridcell', { name: /^5 декабря 2026/ }).getAttribute('aria-current')).toBe('date')
  })

  it('navigates between months with buttons', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }))
    expect(screen.getByText(/январь 2027/i)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Предыдущий месяц' }))
    await userEvent.click(screen.getByRole('button', { name: 'Предыдущий месяц' }))
    expect(screen.getByText(/ноябрь 2026/i)).toBeTruthy()
  })

  it('selects a date by click', async () => {
    const { onChange } = setup()
    await userEvent.click(screen.getByRole('gridcell', { name: /^20 декабря 2026/ }))
    expect(onChange).toHaveBeenCalledWith(d(2026, 12, 20))
  })

  it('moves with arrows, Home/End, PageUp/PageDown and selects with Enter', async () => {
    const { onChange } = setup()
    screen.getByRole('gridcell', { name: /^12 декабря 2026/ }).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowDown}')
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^20 декабря 2026/)
    await userEvent.keyboard('{ArrowLeft}{ArrowUp}')
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^12 декабря 2026/)
    await userEvent.keyboard('{Home}')
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^7 декабря 2026/)
    await userEvent.keyboard('{End}')
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^13 декабря 2026/)
    await userEvent.keyboard('{PageDown}')
    expect(screen.getByText(/январь 2027/i)).toBeTruthy()
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^13 января 2027/)
    await userEvent.keyboard('{PageUp}{PageUp}')
    expect(screen.getByText(/ноябрь 2026/i)).toBeTruthy()
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith(d(2026, 11, 13))
  })

  it('crosses the month boundary with arrows', async () => {
    setup({ value: d(2026, 12, 31) })
    screen.getByRole('gridcell', { name: /^31 декабря 2026/ }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByText(/январь 2027/i)).toBeTruthy()
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^1 января 2027/)
  })
})
