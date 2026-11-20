import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatSearchBar } from './ChatSearchBar'

function setup(props: Partial<React.ComponentProps<typeof ChatSearchBar>> = {}) {
  const handlers = { onQueryChange: vi.fn(), onNext: vi.fn(), onPrev: vi.fn(), onClose: vi.fn() }
  render(<ChatSearchBar open query="рассрочка" current={1} total={2} {...handlers} {...props} />)
  return { ...handlers, user: userEvent.setup() }
}

describe('ChatSearchBar', () => {
  it('renders nothing while closed', () => {
    const { container } = render(
      <ChatSearchBar open={false} query="" current={0} total={0} onQueryChange={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} onClose={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows "N из M" and the buttons up, down and close', () => {
    setup()
    expect(screen.getByText('1 из 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Предыдущее совпадение' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Следующее совпадение' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Закрыть поиск' })).toBeTruthy()
  })

  it('shows "Нет совпадений" and no arrows when nothing is found', () => {
    setup({ query: 'скидка', current: 0, total: 0 })
    expect(screen.getByText('Нет совпадений')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Следующее совпадение' })).toBeNull()
  })

  it('shows no counter for an empty query', () => {
    setup({ query: '', current: 0, total: 0 })
    expect(screen.queryByText('Нет совпадений')).toBeNull()
  })

  it('reports the typed query', async () => {
    const { user, onQueryChange } = setup({ query: '' })
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по чату' }), 'р')
    expect(onQueryChange).toHaveBeenCalledWith('р')
  })

  it('goes to the next match with the button and with Enter, to the previous one with Shift+Enter', async () => {
    const { user, onNext, onPrev } = setup()
    await user.click(screen.getByRole('button', { name: 'Следующее совпадение' }))
    await user.click(screen.getByRole('button', { name: 'Предыдущее совпадение' }))
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrev).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('searchbox'))
    await user.keyboard('{Enter}')
    expect(onNext).toHaveBeenCalledTimes(2)
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onPrev).toHaveBeenCalledTimes(2)
  })

  it('closes with Escape and with the close button', async () => {
    const { user, onClose } = setup()
    await user.click(screen.getByRole('searchbox'))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Закрыть поиск' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
