import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskRow } from './TaskRow'
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

  it('shows the attachment count when there are attachments', () => {
    setup(mkTask('t1', { attachmentCount: 3 }))
    const badge = screen.getByLabelText('Вложений: 3')
    expect(badge.textContent).toBe('3')
  })

  it('hides the attachment count when there are none', () => {
    setup(mkTask('t1', { attachmentCount: 0 }))
    expect(screen.queryByLabelText(/Вложений/)).toBeNull()
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
