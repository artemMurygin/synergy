import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatTitleBar } from './ChatTitleBar'

describe('ChatTitleBar', () => {
  it('shows the chat title and goes back to the list', () => {
    const onOpenList = vi.fn()
    render(<ChatTitleBar title="Цены на MBA" onOpenList={onOpenList} />)
    expect(screen.getByRole('heading', { name: 'Цены на MBA' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'К списку чатов' }))
    expect(onOpenList).toHaveBeenCalledTimes(1)
  })

  it('hides the list button when no handler is given (wide panel)', () => {
    render(<ChatTitleBar title="Чат" />)
    expect(screen.queryByRole('button', { name: 'К списку чатов' })).toBeNull()
  })

  it('has no create or settings buttons: they live in the panel header', () => {
    render(<ChatTitleBar title="Чат" onOpenList={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Новый чат' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Настройки' })).toBeNull()
  })

  it('falls back to a default title for an empty one', () => {
    render(<ChatTitleBar title="" />)
    expect(screen.getByRole('heading', { name: 'Новый чат' })).toBeTruthy()
  })
})

describe('ChatTitleBar running indicator', () => {
  it('shows the indicator only while the agent is answering', () => {
    const { rerender } = render(<ChatTitleBar title="Чат" running />)
    expect(screen.getByLabelText('Агент отвечает')).toBeTruthy()
    rerender(<ChatTitleBar title="Чат" />)
    expect(screen.queryByLabelText('Агент отвечает')).toBeNull()
  })
})
