import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { buildQuickSearchQuery, buildQuickSearchTitle } from '@/shared/quick-search'
import { DEFAULT_QUICK_SEARCH } from './defaults'
import type { QuickSearchValues } from './defaults'
import { QuickSearchForm } from './QuickSearchForm'

function Harness(props: {
  initial?: Partial<QuickSearchValues>
  pending?: boolean
  onSubmit: (query: string, title: string) => void
  onChangeSpy?: (value: QuickSearchValues) => void
}) {
  const [value, setValue] = useState<QuickSearchValues>({ ...DEFAULT_QUICK_SEARCH, ...props.initial })
  return (
    <QuickSearchForm
      value={value}
      onChange={(next) => {
        props.onChangeSpy?.(next)
        setValue(next)
      }}
      pending={props.pending ?? false}
      onSubmit={props.onSubmit}
    />
  )
}

function setup(props: Partial<Parameters<typeof Harness>[0]> = {}) {
  const onSubmit = vi.fn()
  render(<Harness onSubmit={onSubmit} {...props} />)
  return { onSubmit }
}

const openDirections = () => {
  fireEvent.click(screen.getByRole('button', { name: /Направление/ }))
}

describe('QuickSearchForm', () => {
  it('is controlled: a change goes to onChange with the whole value', () => {
    const onChangeSpy = vi.fn()
    setup({ onChangeSpy })
    fireEvent.change(screen.getByRole('combobox', { name: 'Уровень' }), { target: { value: 'master' } })
    expect(onChangeSpy).toHaveBeenCalledWith(expect.objectContaining({ level: 'master', base: '' }))
  })

  it('marks optional fields and shows the direction limit', () => {
    setup()
    expect(screen.getAllByText('необязательно').length).toBeGreaterThan(0)
    expect(screen.getByText('до 3')).toBeTruthy()
  })

  it('switches the segment', () => {
    setup()
    expect(screen.getByRole('radio', { name: 'Образование' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'Курсы и ДПО' }))
    expect(screen.getByRole('radio', { name: 'Курсы и ДПО' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('combobox', { name: 'Уровень' })).toBeNull()
  })

  it('previews the query and the chat title built from the value', () => {
    setup({ initial: { level: 'mba' } })
    const value = { ...DEFAULT_QUICK_SEARCH, level: 'mba' as const }
    expect(screen.getByText('Запрос в чат')).toBeTruthy()
    expect(screen.getByText(buildQuickSearchQuery(value))).toBeTruthy()
    expect(screen.getByText(`Название чата: ${buildQuickSearchTitle(value)}`)).toBeTruthy()
  })

  it('submits the query and the title with "Отправить в чат"', () => {
    const { onSubmit } = setup({ initial: { level: 'mba' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить в чат' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('MBA'),
      expect.stringContaining('MBA'),
    )
  })

  it('blocks the submit while the agent answers', () => {
    setup({ pending: true })
    expect(screen.getByRole('button', { name: 'Отправить в чат' }).hasAttribute('disabled')).toBe(true)
  })

  it('picks directions with synonyms and counts them: "выбрано N из 3"', () => {
    setup()
    openDirections()
    expect(screen.getByText('лечебное дело, сестринское дело, фармация')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /Медицина/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Психология/ }))
    expect(screen.getByText('2 из 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Готово' }))
    expect(screen.getByText('выбрано 2 из 3')).toBeTruthy()
    expect(screen.getByText(/Медицина \(лечебное дело/)).toBeTruthy()
  })

  it('locks the rest after three with a hint, and a selected one can be removed', () => {
    setup({ initial: { directions: ['Медицина', 'Психология', 'Педагогика'] } })
    openDirections()
    expect(
      screen.getByText('Можно выбрать до 3 направлений. Снимите одно, чтобы выбрать другое.'),
    ).toBeTruthy()
    const other = screen.getByRole('checkbox', { name: /Лингвистика/ })
    expect(other.hasAttribute('disabled')).toBe(true)
    const picked = screen.getByRole('checkbox', { name: /Психология/ })
    expect(picked.hasAttribute('disabled')).toBe(false)
    fireEvent.click(picked)
    expect(screen.queryByText(/Можно выбрать до 3 направлений/)).toBeNull()
    expect(screen.getByRole('checkbox', { name: /Лингвистика/ }).hasAttribute('disabled')).toBe(false)
  })

  it('goes back from the picker with the back button', () => {
    setup()
    openDirections()
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(screen.getByRole('button', { name: 'Отправить в чат' })).toBeTruthy()
  })

  it('switches to courses with topic chips and a free topic field', () => {
    const { onSubmit } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Курсы и ДПО' }))
    fireEvent.click(screen.getByRole('button', { name: 'маркетинг' }))
    fireEvent.change(screen.getByPlaceholderText('Своя тема'), { target: { value: 'охрана труда' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить в чат' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringMatching(/маркетинг.*охрана труда/),
      expect.any(String),
    )
  })

  it('toggles the state support switch where the level allows it', () => {
    setup()
    const toggle = screen.getByRole('switch', { name: 'Только с господдержкой' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.change(screen.getByRole('combobox', { name: 'Уровень' }), { target: { value: 'mba' } })
    expect(screen.queryByRole('switch', { name: 'Только с господдержкой' })).toBeNull()
  })

  it('picks the base, the ege answer and the count as chips', () => {
    setup()
    const base = screen.getByRole('group', { name: 'База клиента' })
    fireEvent.click(within(base).getByRole('button', { name: 'Высшее' }))
    expect(within(base).getByRole('button', { name: 'Высшее' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(screen.getByRole('group', { name: 'Сколько показать' })).getByRole('button', { name: '10' }))
    expect(screen.getByText(/до 10 программ/)).toBeTruthy()
  })
})
