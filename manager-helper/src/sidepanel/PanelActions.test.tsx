import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PanelActions } from './PanelActions'

describe('PanelActions', () => {
  it('wires the create and settings buttons', () => {
    const onAction = vi.fn()
    const onOpenSettings = vi.fn()
    render(
      <PanelActions actionLabel="Новый чат" onAction={onAction} onOpenSettings={onOpenSettings} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Новый чат' }))
    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('disables the create button', () => {
    const onAction = vi.fn()
    render(
      <PanelActions
        actionLabel="Новый чат"
        onAction={onAction}
        actionDisabled
        onOpenSettings={() => undefined}
      />,
    )
    const button = screen.getByRole('button', { name: 'Новый чат' })
    expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.click(button)
    expect(onAction).not.toHaveBeenCalled()
  })

  it('renders the trailing slot (notifications, profile) after the settings button', () => {
    render(
      <PanelActions
        actionLabel="Новый чат"
        onAction={() => undefined}
        onOpenSettings={() => undefined}
        trailing={<button type="button">Уведомления</button>}
      />,
    )
    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent)
    expect(names).toEqual(['Новый чат', 'Настройки', 'Уведомления'])
  })

  it('reports the expanded state of an inline create form', () => {
    render(
      <PanelActions
        actionLabel="Новая задача"
        onAction={() => undefined}
        actionExpanded
        onOpenSettings={() => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: 'Новая задача' }).getAttribute('aria-expanded')).toBe(
      'true',
    )
  })
})
