import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutModeProvider } from '../layout/layout-mode'
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

describe('UserPicker: счётчик результатов', () => {
  it('«Найдено N»', async () => {
    render(<UserPicker label="Ответственный" search={search()} value={null} onChange={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ответственный' }))
    expect(await screen.findByText('Найдено 2')).toBeTruthy()
  })

  it('mobile, полная страница: «Показаны первые N · уточните поиск» и «Готово»', async () => {
    render(
      <LayoutModeProvider mode="mobile">
        <UserPicker label="Ответственный" search={search({ pageSize: 2 })} value={null} onChange={() => undefined} />
      </LayoutModeProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ответственный' }))
    expect(await screen.findByText('Показаны первые 2 · уточните поиск')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Готово' }))
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('mobile, неполная страница: «Найдено N»', async () => {
    render(
      <LayoutModeProvider mode="mobile">
        <UserPicker label="Ответственный" search={search({ pageSize: 20 })} value={null} onChange={() => undefined} />
      </LayoutModeProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ответственный' }))
    expect(await screen.findByText('Найдено 2')).toBeTruthy()
    expect(screen.queryByText(/уточните поиск/)).toBeNull()
  })

  it('desktop: «Показаны первые» не показывается', async () => {
    render(<UserPicker label="Ответственный" search={search({ pageSize: 2 })} value={null} onChange={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ответственный' }))
    expect(await screen.findByText('Найдено 2')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Готово' })).toBeNull()
  })
})
