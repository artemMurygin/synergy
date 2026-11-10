import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PanelHeader } from './PanelHeader'

describe('PanelHeader', () => {
  it('renders the switcher and wires the create and settings buttons', () => {
    const onAction = vi.fn()
    const onOpenSettings = vi.fn()
    render(
      <PanelHeader
        switcher={<div>переключатель</div>}
        actionLabel="Новый чат"
        onAction={onAction}
        onOpenSettings={onOpenSettings}
      />,
    )
    expect(screen.getByText('переключатель')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Новый чат' }))
    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('disables the create button', () => {
    const onAction = vi.fn()
    render(
      <PanelHeader
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

  it('renders the notifications slot between the create and the settings buttons', () => {
    render(
      <PanelHeader
        actionLabel="Новый чат"
        onAction={() => undefined}
        onOpenSettings={() => undefined}
        notifications={<button type="button">Уведомления</button>}
      />,
    )
    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent)
    expect(names).toEqual(['Новый чат', 'Уведомления', 'Настройки'])
  })

  it('reports the expanded state of an inline create form', () => {
    render(
      <PanelHeader
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
