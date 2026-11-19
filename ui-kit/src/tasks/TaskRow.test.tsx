import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeTask, NOW } from './fixtures'
import { DeadlineLabel } from './DeadlineLabel'
import { StatusBadge } from './StatusBadge'
import { TaskRow } from './TaskRow'

describe('StatusBadge', () => {
  it('показывает статус текстом', () => {
    render(<StatusBadge status="in_progress" />)
    expect(screen.getByText('В работе')).toBeTruthy()
  })
})

describe('DeadlineLabel', () => {
  it('просрочено — текстом', () => {
    render(<DeadlineLabel deadline="2026-11-05T10:00:00" status="todo" now={NOW} />)
    expect(screen.getByText(/Просрочено/)).toBeTruthy()
  })
  it('без срока', () => {
    render(<DeadlineLabel deadline={null} status="todo" now={NOW} />)
    expect(screen.getByText('Без срока')).toBeTruthy()
  })
  it('готовая задача с прошедшим дедлайном не просрочена', () => {
    render(<DeadlineLabel deadline="2026-11-05T10:00:00" status="done" now={NOW} />)
    expect(screen.queryByText(/Просрочено/)).toBeNull()
  })
})

describe('TaskRow', () => {
  it('показывает название, статус, ответственного, дедлайн и число вложений (wide)', () => {
    render(
      <ul>
        <TaskRow task={makeTask()} now={NOW} variant="wide" onOpen={() => undefined} />
      </ul>,
    )
    expect(screen.getByText('Подготовить КП')).toBeTruthy()
    expect(screen.getByText('В работе')).toBeTruthy()
    expect(screen.getByText('maria')).toBeTruthy()
    expect(screen.getByText('12 дек, 18:00')).toBeTruthy()
    expect(screen.getByText(/2 вложения/)).toBeTruthy()
  })

  it('«Просрочено» текстом у просроченной задачи', () => {
    render(
      <ul>
        <TaskRow task={makeTask({ deadline: '2026-11-01T10:00:00' })} now={NOW} onOpen={() => undefined} />
      </ul>,
    )
    expect(screen.getByText(/Просрочено/)).toBeTruthy()
  })

  it('открывает задачу по названию и отмечает выполненной по кружку', async () => {
    const onOpen = vi.fn()
    const onSetStatus = vi.fn()
    render(
      <ul>
        <TaskRow task={makeTask()} now={NOW} onOpen={onOpen} onSetStatus={onSetStatus} />
      </ul>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Подготовить КП' }))
    expect(onOpen).toHaveBeenCalledWith('t1')
    await userEvent.click(screen.getByRole('button', { name: /Отметить выполненной/ }))
    expect(onSetStatus).toHaveBeenCalledWith('t1', 'done')
  })

  it('выбранная строка помечена aria-current', () => {
    render(
      <ul>
        <TaskRow task={makeTask()} now={NOW} selected onOpen={() => undefined} />
      </ul>,
    )
    expect(screen.getByRole('button', { name: 'Подготовить КП' }).getAttribute('aria-current')).toBe('true')
  })
})
