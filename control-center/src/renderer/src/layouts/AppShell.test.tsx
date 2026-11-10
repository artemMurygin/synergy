import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticatedSnapshot } from '@/features/auth/auth-test-utils'
import { useSessionStore } from '@/features/auth/session.store'
import { useUiStore } from '@/stores/ui.store'
import { AppShell } from './AppShell'
import { NavRail } from './NavRail'

afterEach(cleanup)

beforeEach(() => {
  useUiStore.setState({ section: 'chats', dark: false })
  useSessionStore.setState({ snapshot: authenticatedSnapshot })
})

function Draft({ label }: { label: string }) {
  const [text, setText] = useState('')
  return <input aria-label={label} value={text} onChange={(e) => setText(e.target.value)} />
}

function mount(tasks: () => void = () => {}) {
  function Tasks() {
    tasks()
    return <Draft label="Фильтр задач" />
  }
  render(<AppShell rail={<NavRail />} chats={<Draft label="Сообщение" />} tasks={<Tasks />} />)
  return userEvent.setup()
}

describe('AppShell', () => {
  it('shows the rail with both sections and marks chats as current', () => {
    mount()
    const nav = screen.getByRole('navigation')
    expect(nav).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Чаты' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Задачи' }).getAttribute('aria-current')).toBeNull()
  })

  it('does not mount the tasks section until it is opened', () => {
    const onRender = vi.fn()
    mount(onRender)
    expect(onRender).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Фильтр задач')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Задачи', hidden: true })).toBeNull()
  })

  it('switches to tasks through the rail and hides the chats section', async () => {
    const user = mount()
    await user.click(screen.getByRole('button', { name: 'Задачи' }))
    expect(useUiStore.getState().section).toBe('tasks')
    expect(screen.getByRole('button', { name: 'Задачи' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByLabelText('Фильтр задач')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Чаты' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Задачи' })).toBeTruthy()
  })

  it('keeps the hidden section mounted and restores its state on return', async () => {
    const user = mount()
    await user.type(screen.getByLabelText('Сообщение'), 'черновик')
    await user.click(screen.getByRole('button', { name: 'Задачи' }))
    await user.type(screen.getByLabelText('Фильтр задач'), 'отчёт')
    // hidden but still in the DOM
    expect(screen.getByLabelText('Сообщение', { selector: 'input' }).closest('[hidden]')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Чаты' }))
    expect((screen.getByLabelText('Сообщение') as HTMLInputElement).value).toBe('черновик')
    await user.click(screen.getByRole('button', { name: 'Задачи' }))
    expect((screen.getByLabelText('Фильтр задач') as HTMLInputElement).value).toBe('отчёт')
  })

  it('mounts the tasks section immediately when it was the active one', () => {
    useUiStore.setState({ section: 'tasks' })
    mount()
    expect(screen.getByLabelText('Фильтр задач')).toBeTruthy()
  })
})
