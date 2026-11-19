import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutModeProvider, type LayoutMode } from '../layout/layout-mode'
import { AppFrame } from './AppFrame'

const sections = [
  { id: 'chats', label: 'Чаты', icon: <svg /> },
  { id: 'tasks', label: 'Задачи', icon: <svg />, badge: 1 },
]

function setup(mode: LayoutMode, onSectionChange = vi.fn()) {
  const view = render(
    <LayoutModeProvider mode={mode}>
      <AppFrame
        nav={<button type="button">Профиль</button>}
        header={<div>Шапка</div>}
        body={<div>Содержимое</div>}
        sections={sections}
        activeSection="chats"
        onSectionChange={onSectionChange}
      />
    </LayoutModeProvider>,
  )
  return { ...view, onSectionChange }
}

describe('AppFrame', () => {
  it.each<LayoutMode>(['desktop', 'tablet'])('shows the NavRail in %s mode', (mode) => {
    const { container } = setup(mode)
    expect(container.querySelector('[data-slot="nav-rail"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="tab-bar"]')).toBeNull()
    expect(container.querySelector('[data-slot="tab-bar-spacer"]')).toBeNull()
    expect(screen.getByText('Профиль')).toBeTruthy()
    expect(screen.getByText('Содержимое')).toBeTruthy()
  })

  it('shows the floating TabBar with a bottom spacer in mobile mode', () => {
    const { container } = setup('mobile')
    expect(container.querySelector('[data-slot="nav-rail"]')).toBeNull()
    expect(container.querySelector('[data-slot="tab-bar"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="tab-bar-spacer"]')).not.toBeNull()
    expect(screen.getByText('Шапка')).toBeTruthy()
  })

  it('reports section changes and marks the active section', async () => {
    const { onSectionChange } = setup('desktop')
    expect(screen.getByRole('button', { name: /Чаты/ }).getAttribute('aria-current')).toBe('page')
    await userEvent.click(screen.getByRole('button', { name: /Задачи/ }))
    expect(onSectionChange).toHaveBeenCalledWith('tasks')
  })
})
