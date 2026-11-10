import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachmentsLabel, TaskRow } from './TaskRow'
import { mkTask, NOW } from './test-utils'

afterEach(cleanup)

function setup(task = mkTask('t1'), selected = false) {
  const onSelect = vi.fn()
  const onStatusChange = vi.fn()
  render(
    <ul>
      <TaskRow task={task} selected={selected} now={NOW} onSelect={onSelect} onStatusChange={onStatusChange} />
    </ul>
  )
  return { onSelect, onStatusChange, user: userEvent.setup() }
}

describe('TaskRow', () => {
  it('shows title, assignee and status', () => {
    setup(mkTask('t1', { title: 'Подготовить КП' }))
    expect(screen.getByText('Подготовить КП')).toBeTruthy()
    expect(screen.getByText('anna')).toBeTruthy()
    expect(screen.getByText('К выполнению')).toBeTruthy()
  })

  it('shows the creator and the attachment count under the title', () => {
    setup(mkTask('t1', { attachmentCount: 3 }))
    expect(screen.getByText('Создал admin · 3 вложения')).toBeTruthy()
  })

  it('shows only the creator when there are no attachments', () => {
    setup(mkTask('t1', { attachmentCount: 0 }))
    expect(screen.getByText('Создал admin')).toBeTruthy()
    expect(screen.queryByText(/вложени/)).toBeNull()
  })

  it('shows an avatar and "Не назначен" without an assignee', () => {
    const { container } = render(
      <ul>
        <TaskRow task={mkTask('t2', { assignee: null })} selected={false} now={NOW} onSelect={vi.fn()} onStatusChange={vi.fn()} />
      </ul>
    )
    expect(screen.getByText('Не назначен')).toBeTruthy()
    expect(container.querySelector('[data-slot="user-avatar"]')?.textContent).toBe('—')
  })

  it('shows the assignee initials next to the login', () => {
    const { container } = render(
      <ul>
        <TaskRow task={mkTask('t2')} selected={false} now={NOW} onSelect={vi.fn()} onStatusChange={vi.fn()} />
      </ul>
    )
    expect(container.querySelector('[data-slot="user-avatar"]')?.textContent).toBe('AN')
  })

  it('shows the closing date of a done task', () => {
    setup(mkTask('t1', { status: 'done', completedAt: '2026-03-07T12:00:00Z' }))
    expect(screen.getByText('Закрыто 7 мар')).toBeTruthy()
  })

  it('selects the task by its accessible name', async () => {
    const { onSelect, user } = setup(mkTask('t1', { title: 'Подготовить КП' }))
    await user.click(screen.getByRole('button', { name: 'Открыть задачу: Подготовить КП' }))
    expect(onSelect).toHaveBeenCalledWith('t1')
  })

  it('marks the selected task', () => {
    setup(mkTask('t1', { title: 'A' }), true)
    expect(screen.getByRole('button', { name: 'Открыть задачу: A' }).getAttribute('aria-current')).toBe('true')
  })

  it('completes an open task from the row', async () => {
    const { onStatusChange, user } = setup(mkTask('t1', { title: 'A' }))
    await user.click(screen.getByRole('button', { name: 'Отметить выполненной: A' }))
    expect(onStatusChange).toHaveBeenCalledWith('t1', 'done')
  })

  it('reopens a done task from the row', async () => {
    const { onStatusChange, user } = setup(mkTask('t1', { title: 'A', status: 'done' }))
    await user.click(screen.getByRole('button', { name: 'Вернуть в работу: A' }))
    expect(onStatusChange).toHaveBeenCalledWith('t1', 'todo')
  })

  it('labels an overdue task with text', () => {
    setup(mkTask('t1', { deadline: '2026-03-05T00:00:00Z' }))
    expect(screen.getByText(/Просрочено/)).toBeTruthy()
  })

  it('does not select the task when the status control is used', async () => {
    const { onSelect, user } = setup(mkTask('t1', { title: 'A' }))
    await user.click(screen.getByRole('button', { name: 'Отметить выполненной: A' }))
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('attachmentsLabel', () => {
  it.each([
    [1, '1 вложение'],
    [2, '2 вложения'],
    [4, '4 вложения'],
    [5, '5 вложений'],
    [11, '11 вложений'],
    [12, '12 вложений'],
    [21, '21 вложение'],
    [22, '22 вложения'],
    [111, '111 вложений']
  ])('%i → %s', (n, label) => {
    expect(attachmentsLabel(n)).toBe(label)
  })
})
