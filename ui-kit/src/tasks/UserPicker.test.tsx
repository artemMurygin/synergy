import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UserPicker, WATCHERS_LIMIT, type UserSearchProps } from './UserPicker'
import type { UserSummary } from './types'

const maria: UserSummary = { id: 'u1', login: 'maria' }
const ivan: UserSummary = { id: 'u2', login: 'ivan' }

function search(over: Partial<UserSearchProps> = {}): UserSearchProps {
  return { users: [maria, ivan], onSearch: vi.fn(), ...over }
}

describe('UserPicker (один пользователь)', () => {
  it('ищет по вводу и выбирает пользователя', async () => {
    const onChange = vi.fn()
    const s = search()
    render(<UserPicker label="Ответственный" search={s} value={null} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ответственный' }))
    await userEvent.type(await screen.findByRole('combobox', { name: 'Поиск по логину' }), 'iv')
    expect(s.onSearch).toHaveBeenLastCalledWith('iv')
    await userEvent.click(screen.getByRole('option', { name: /ivan/ }))
    expect(onChange).toHaveBeenCalledWith(ivan)
  })

  it('кнопка «Я» выбирает текущего пользователя', async () => {
    const onChange = vi.fn()
    render(<UserPicker label="Ответственный" search={search()} me={maria} value={null} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Я' }))
    expect(onChange).toHaveBeenCalledWith(maria)
  })

  it('кнопки «Я» нет, если я уже выбран', () => {
    render(<UserPicker label="Ответственный" search={search()} me={maria} value={maria} onChange={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Я' })).toBeNull()
  })

  it('ошибка загрузки с «Повторить»', async () => {
    const onRetry = vi.fn()
    render(
      <UserPicker
        label="Ответственный"
        search={search({ users: [], error: 'Не удалось загрузить пользователей', onRetry })}
        value={null}
        onChange={() => undefined}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ответственный' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('UserPicker (наблюдатели)', () => {
  it('добавляет и снимает наблюдателей', async () => {
    const onChange = vi.fn()
    render(<UserPicker multiple label="Наблюдатели" search={search()} value={[maria]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Наблюдатели' }))
    await userEvent.click(await screen.findByRole('option', { name: /ivan/ }))
    expect(onChange).toHaveBeenCalledWith([maria, ivan])
    await userEvent.click(screen.getByRole('button', { name: 'Убрать maria' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('лимит 50 наблюдателей: новых добавить нельзя, показано сообщение', async () => {
    const onChange = vi.fn()
    const many: UserSummary[] = Array.from({ length: WATCHERS_LIMIT }, (_, i) => ({ id: `w${String(i)}`, login: `w${String(i)}` }))
    render(<UserPicker multiple label="Наблюдатели" search={search()} value={many} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Наблюдатели' }))
    const option = await screen.findByRole('option', { name: /ivan/ })
    expect(option.getAttribute('aria-disabled')).toBe('true')
    await userEvent.click(option)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/не более 50/)).toBeTruthy()
  })

  it('«Я» добавляет меня в наблюдатели', async () => {
    const onChange = vi.fn()
    render(<UserPicker multiple label="Наблюдатели" search={search()} me={maria} value={[ivan]} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Я' }))
    expect(onChange).toHaveBeenCalledWith([ivan, maria])
  })
})
