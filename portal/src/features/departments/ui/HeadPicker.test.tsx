import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { json, page, queryWrapper, stubFetch } from '@/test/helpers'
import { employeeOptionFixtures } from '../model/fixtures'
import { HeadPicker, type HeadValue } from './HeadPicker'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'a1', login: 'admin', mustChangePassword: false, roles: ['admin'], fullName: 'admin', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup(value: HeadValue | null = null, answer: () => Response = () => json(page(employeeOptionFixtures))) {
  const onChange = vi.fn()
  const stub = stubFetch(answer)
  const Wrapper = queryWrapper()
  render(
    <Wrapper>
      <HeadPicker value={value} onChange={onChange} />
    </Wrapper>
  )
  return { onChange, ...stub }
}

const petrova: HeadValue = { id: 'u-petrova', fullName: 'Петрова Мария Сергеевна', isActive: true }

describe('HeadPicker', () => {
  it('shows "Не назначен" when nobody is chosen and does not load before opening', () => {
    const { calls } = setup()
    expect(screen.getByRole('combobox').textContent).toContain('Не назначен')
    expect(calls).toHaveLength(0)
  })

  it('draws no avatar for "Не назначен" and shows the text in ink-40', () => {
    setup()
    const combo = screen.getByRole('combobox')
    expect(combo.querySelector('.rounded-full')).toBeNull()
    expect(screen.getByText('Не назначен').className).toContain('text-ink-40')
  })

  it('draws the avatar of an assigned head', () => {
    setup(petrova)
    expect(screen.getByRole('combobox').querySelector('.rounded-full')).not.toBeNull()
  })

  it('is a combobox that controls a listbox and reports expanded', async () => {
    setup()
    const combo = screen.getByRole('combobox')
    expect(combo.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(combo)
    expect(combo.getAttribute('aria-expanded')).toBe('true')
    const listbox = await screen.findByRole('listbox')
    expect(combo.getAttribute('aria-controls')).toBe(listbox.id)
  })

  it('lists employees as "full name" with their department', async () => {
    setup()
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByRole('option', { name: /Петрова Мария Сергеевна/ })).toBeTruthy()
    expect(screen.getByText('Продажи')).toBeTruthy()
    expect(screen.getByText('Без отдела')).toBeTruthy()
  })

  it('asks only for active employees', async () => {
    const { calls } = setup()
    await userEvent.click(screen.getByRole('combobox'))
    await screen.findByRole('option', { name: /Петрова/ })
    expect(new URLSearchParams(calls[0]?.search).get('isActive')).toBe('true')
  })

  it('searches after a pause of 300 ms and sends the text', async () => {
    const { calls } = setup()
    await userEvent.click(screen.getByRole('combobox'))
    await screen.findByRole('option', { name: /Петрова/ })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Найти сотрудника' }), 'пол')
    await waitFor(() => expect(calls.some((c) => new URLSearchParams(c.search).get('search') === 'пол')).toBe(true))
    expect(calls.some((c) => new URLSearchParams(c.search).get('search') === 'п')).toBe(false)
  })

  it('chooses an employee on click, reports him and closes the list', async () => {
    const { onChange } = setup()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: /Полякова Елена Викторовна/ }))
    expect(onChange).toHaveBeenCalledWith({ id: 'u-polyakova', fullName: 'Полякова Елена Викторовна', isActive: true })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('moves with the arrow keys and picks with Enter', async () => {
    const { onChange } = setup()
    await userEvent.click(screen.getByRole('combobox'))
    await screen.findByRole('option', { name: /Петрова/ })
    const search = screen.getByRole('searchbox', { name: 'Найти сотрудника' })
    await userEvent.type(search, '{ArrowDown}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-polyakova' }))
  })

  it('Escape closes the list only', async () => {
    setup()
    await userEvent.click(screen.getByRole('combobox'))
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('marks the chosen employee in the list', async () => {
    setup(petrova)
    await userEvent.click(screen.getByRole('combobox'))
    const chosen = await screen.findByRole('option', { name: /Петрова/ })
    expect(chosen.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: /Полякова/ }).getAttribute('aria-selected')).toBe('false')
  })

  it('offers "Снять руководителя" first only when a head is assigned and clears the head', async () => {
    const { onChange } = setup(petrova)
    await userEvent.click(screen.getByRole('combobox'))
    const options = await screen.findAllByRole('option')
    expect(options[0]?.textContent).toContain('Снять руководителя')
    await userEvent.click(options[0] as HTMLElement)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('has no "Снять руководителя" without a head', async () => {
    setup(null)
    await userEvent.click(screen.getByRole('combobox'))
    await screen.findByRole('option', { name: /Петрова/ })
    expect(screen.queryByText('Снять руководителя')).toBeNull()
  })

  it('keeps an assigned dismissed head in the field with the badge "Уволен"', () => {
    setup({ id: 'u-pavlov', fullName: 'Павлов Артём Игоревич', isActive: false })
    const combo = screen.getByRole('combobox')
    expect(combo.textContent).toContain('Павлов Артём Игоревич')
    expect(combo.textContent).toContain('Уволен')
  })

  it('shows no badge for an active head', () => {
    setup(petrova)
    expect(screen.getByRole('combobox').textContent).not.toContain('Уволен')
  })

  it('says "Никого не нашли" for an empty answer', async () => {
    setup(null, () => json(page([])))
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Никого не нашли')).toBeTruthy()
  })

  it('shows the error with "Повторить" and loads again', async () => {
    let fail = true
    const { calls } = setup(null, () => (fail ? json({ message: 'boom' }, 500) : json(page(employeeOptionFixtures))))
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Не удалось загрузить сотрудников')).toBeTruthy()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('option', { name: /Петрова/ })).toBeTruthy()
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })
})
