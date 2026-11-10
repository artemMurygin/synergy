import './test-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session.store'
import type { UserSummary } from '@/lib/backend/tasks.schema'
import { listUsers } from '@/lib/backend/users.api'
import { UserPicker } from './UserPicker'

vi.mock('@/lib/backend/users.api')

afterEach(cleanup)

const ALL: UserSummary[] = [
  { id: 'u1', login: 'anna' },
  { id: 'u2', login: 'maria' },
  { id: 'u3', login: 'marat' },
  { id: 'u4', login: 'marina' }
]

beforeEach(() => {
  vi.resetAllMocks()
  useSessionStore.setState({ snapshot: { state: 'authenticated', user: { id: 'u1', login: 'anna' } } })
  vi.mocked(listUsers).mockImplementation(({ search }) => {
    const items = ALL.filter((u) => u.login.includes(search ?? ''))
    return Promise.resolve({ items, total: items.length, limit: 20, page: 1 })
  })
})

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function Single({ onChange }: { onChange: (user: UserSummary | null) => void }) {
  const [value, setValue] = useState<UserSummary | null>(null)
  return (
    <UserPicker
      label="Ответственный"
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

function Multi({
  onChange,
  initial = [],
  max
}: {
  onChange: (users: UserSummary[]) => void
  initial?: UserSummary[]
  max?: number
}) {
  const [value, setValue] = useState<UserSummary[]>(initial)
  return (
    <UserPicker
      multiple
      max={max}
      itemsLabel="наблюдателей"
      label="Наблюдатели"
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

const trigger = (name: RegExp) => screen.getByRole('button', { name })

describe('UserPicker · single', () => {
  it('asks the server only after a pause in typing', async () => {
    const user = userEvent.setup()
    renderWithClient(<Single onChange={vi.fn()} />)
    await user.click(trigger(/Ответственный/))
    await screen.findByRole('option', { name: /anna/ })
    await user.type(screen.getByRole('combobox'), 'ma')

    expect(listUsers).not.toHaveBeenCalledWith(expect.objectContaining({ search: 'm' }))
    expect(listUsers).not.toHaveBeenCalledWith(expect.objectContaining({ search: 'ma' }))
    await waitFor(() => expect(listUsers).toHaveBeenCalledWith({ search: 'ma', limit: 20 }))
    expect(listUsers).not.toHaveBeenCalledWith(expect.objectContaining({ search: 'm' }))
    expect(await screen.findAllByRole('option')).toHaveLength(3)
  })

  it('selects a user, closes the list and shows the login', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithClient(<Single onChange={onChange} />)
    await user.click(trigger(/Ответственный/))
    await user.click(await screen.findByRole('option', { name: /maria/ }))

    expect(onChange).toHaveBeenCalledWith({ id: 'u2', login: 'maria' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(trigger(/Ответственный/).textContent).toContain('maria')
  })

  it('marks the current user and lets them pick themselves in one click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithClient(<Single onChange={onChange} />)
    await user.click(trigger(/Ответственный/))
    const me = await screen.findByRole('option', { name: /anna/ })
    expect(within(me).getByText('это вы')).toBeTruthy()
    expect(within(screen.getByRole('option', { name: /maria/ })).queryByText('это вы')).toBeNull()

    await user.click(me)
    expect(onChange).toHaveBeenCalledWith({ id: 'u1', login: 'anna' })
  })

  it('clears the choice when the selected user is picked again', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithClient(<Single onChange={onChange} />)
    await user.click(trigger(/Ответственный/))
    await user.click(await screen.findByRole('option', { name: /maria/ }))
    await user.click(trigger(/Ответственный/))
    await user.click(await screen.findByRole('option', { name: /maria/ }))

    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('is driven from the keyboard and returns focus to the field on Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithClient(<Single onChange={onChange} />)
    trigger(/Ответственный/).focus()
    await user.keyboard('{Enter}')
    const search = await screen.findByRole('combobox')
    expect(document.activeElement).toBe(search)
    await user.type(search, 'ma')
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))

    expect(search.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0].id)
    await user.keyboard('{ArrowDown}')
    expect(search.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id)
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith({ id: 'u3', login: 'marat' })

    await user.keyboard('{Enter}')
    await screen.findByRole('combobox')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(document.activeElement).toBe(trigger(/Ответственный/))
  })

  it('says so when nobody matches', async () => {
    const user = userEvent.setup()
    renderWithClient(<Single onChange={vi.fn()} />)
    await user.click(trigger(/Ответственный/))
    await user.type(await screen.findByRole('combobox'), 'zzz')
    expect(await screen.findByText('Никого не нашли')).toBeTruthy()
  })
})

describe('UserPicker · multiple', () => {
  it('collects several users without repeats and lets them be removed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithClient(<Multi onChange={onChange} />)
    await user.click(trigger(/Наблюдатели/))
    await user.click(await screen.findByRole('option', { name: /maria/ }))
    expect(screen.getByRole('listbox')).toBeTruthy()
    await user.click(screen.getByRole('option', { name: /marat/ }))
    expect(onChange).toHaveBeenLastCalledWith([
      { id: 'u2', login: 'maria' },
      { id: 'u3', login: 'marat' }
    ])
    expect(screen.getByText('Выбрано 2 из 50')).toBeTruthy()
    expect(screen.getByRole('option', { name: /maria/ }).getAttribute('aria-selected')).toBe('true')

    // picking maria again removes her instead of duplicating
    await user.click(screen.getByRole('option', { name: /maria/ }))
    expect(onChange).toHaveBeenLastCalledWith([{ id: 'u3', login: 'marat' }])

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Убрать marat' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('refuses the 51st watcher and explains why', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const fifty = Array.from({ length: 50 }, (_, i) => ({ id: `w${i}`, login: `watcher${i}` }))
    renderWithClient(<Multi onChange={onChange} initial={fifty} />)
    await user.click(trigger(/Наблюдатели/))
    const option = await screen.findByRole('option', { name: /maria/ })

    expect(option.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Выбрано 50 из 50')).toBeTruthy()
    expect(screen.getByText('Достигнут лимит: не более 50 наблюдателей')).toBeTruthy()
    await user.click(option)
    expect(onChange).not.toHaveBeenCalled()
  })
})
