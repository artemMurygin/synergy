import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FIXED_WIDTH, makeTask } from './fixtures'
import { TaskList } from './TaskList'

const NOW = new Date('2026-11-09T10:00:00.000Z')

function setup(props: Partial<Parameters<typeof TaskList>[0]> = {}) {
  const handlers = {
    onOpen: vi.fn(),
    onSetStatus: vi.fn(),
    onLoadMore: vi.fn(),
    onRetry: vi.fn(),
    onCreate: vi.fn(),
  }
  const view = render(
    <TaskList
      items={[]}
      loading={false}
      loadingMore={false}
      error={null}
      hasMore={false}
      remaining={0}
      selectedId={null}
      now={NOW}
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, ...view }
}

describe('TaskList rows', () => {
  it('shows title, status text and deadline of each task', () => {
    setup({
      items: [
        makeTask('a', { title: 'Отчёт', deadline: '2099-12-12T12:00:00.000Z' }),
        makeTask('b', { title: 'КП', status: 'in_progress' }),
      ],
    })
    expect(screen.getByRole('button', { name: 'Отчёт' })).toBeTruthy()
    expect(screen.getByText('К выполнению')).toBeTruthy()
    expect(screen.getByText('В работе')).toBeTruthy()
    expect(screen.getByText(/12 дек/)).toBeTruthy()
    expect(screen.getByText('Без срока')).toBeTruthy()
  })

  it('labels an overdue task with the word "Просрочено"', () => {
    setup({ items: [makeTask('a', { deadline: '2026-11-05T12:00:00.000Z' })] })
    expect(screen.getByText(/Просрочено/)).toBeTruthy()
    expect(screen.getByText(/Просрочено/).textContent).toMatch(/5 ноя/)
  })

  it('does not label a task due in the future or a done task', () => {
    setup({
      items: [
        makeTask('a', { deadline: '2026-11-20T12:00:00.000Z' }),
        makeTask('b', { deadline: '2026-11-05T12:00:00.000Z', status: 'done' }),
      ],
    })
    expect(screen.queryByText(/Просрочено/)).toBeNull()
  })

  it('opens the task on a title click', () => {
    const { onOpen } = setup({ items: [makeTask('a', { title: 'Отчёт' })] })
    fireEvent.click(screen.getByRole('button', { name: 'Отчёт' }))
    expect(onOpen).toHaveBeenCalledWith('a')
  })

  it('marks the selected task as current', () => {
    setup({ items: [makeTask('a', { title: 'Отчёт' })], selectedId: 'a' })
    expect(screen.getByRole('button', { name: 'Отчёт' }).getAttribute('aria-current')).toBe('true')
  })

  it('closes a task with one action from the row', () => {
    const { onSetStatus } = setup({
      items: [
        makeTask('a', { title: 'Отчёт' }),
        makeTask('b', { title: 'КП', status: 'in_progress' }),
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Отметить выполненной: Отчёт' }))
    expect(onSetStatus).toHaveBeenCalledWith('a', 'done')
    fireEvent.click(screen.getByRole('button', { name: 'Отметить выполненной: КП' }))
    expect(onSetStatus).toHaveBeenCalledWith('b', 'done')
  })

  it('shows "Показать ещё" only when more tasks remain and loads them on click', () => {
    const { onLoadMore, rerender } = setup({
      items: [makeTask('a')],
      hasMore: true,
      remaining: 7,
    })
    fireEvent.click(screen.getByRole('button', { name: /Показать ещё/ }))
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    rerender(
      <TaskList
        items={[makeTask('a')]}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        remaining={0}
        selectedId={null}
        now={NOW}
        onOpen={vi.fn()}
        onSetStatus={vi.fn()}
        onLoadMore={onLoadMore}
        onRetry={vi.fn()}
        onCreate={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /Показать ещё/ })).toBeNull()
  })

  it('disables "Показать ещё" while loading the next page', () => {
    setup({ items: [makeTask('a')], hasMore: true, remaining: 3, loadingMore: true })
    const button = screen.getByRole('button', { name: /Показать ещё/ })
    expect(button.hasAttribute('disabled')).toBe(true)
  })
})

describe('TaskList states', () => {
  it('shows the loading state', () => {
    setup({ loading: true })
    expect(screen.getByRole('status', { name: 'Загрузка задач' })).toBeTruthy()
  })

  it('shows the empty state with a "Создать задачу" action', () => {
    const { onCreate } = setup()
    expect(screen.getByText('Задач нет')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Создать задачу' }))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['watching', 'Вы не наблюдаете ни за одной задачей.'],
    ['created', 'Вы ещё не создавали задач.'],
    ['done', 'Завершённых задач пока нет.'],
  ] as const)('explains an empty "%s" view without offering to create', (view, text) => {
    setup({ view })
    expect(screen.getByText(text)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Создать задачу' })).toBeNull()
  })

  it('says nothing was found when a search is active', () => {
    setup({ searching: true })
    expect(screen.getByText('Ничего не найдено')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Создать задачу' })).toBeNull()
  })

  it('shows the error with "Повторить"', () => {
    const { onRetry } = setup({ error: 'Сервер недоступен' })
    expect(within(screen.getByRole('alert')).getByText(/Сервер недоступен/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('keeps the list out of the loading state once loaded', () => {
    setup({ items: [makeTask('a')] })
    expect(screen.queryByRole('status', { name: 'Загрузка задач' })).toBeNull()
    expect(screen.queryByText('Задач нет')).toBeNull()
  })
})

describe('TaskList in a 320 px panel', () => {
  it('has no fixed widths and lets long text wrap', () => {
    const long = 'Очень-длинное-название-задачи-без-пробелов-'.repeat(4)
    const { container } = setup({
      items: [makeTask('a', { title: long, deadline: '2026-11-05T12:00:00.000Z' })],
      hasMore: true,
      remaining: 3,
    })
    const html = container.innerHTML
    expect(html).not.toMatch(FIXED_WIDTH)
    expect(html).not.toMatch(/style="[^"]*width/)
    expect(screen.getByRole('button', { name: long }).className).toMatch(
      /break-words|wrap-anywhere/,
    )
    expect(container.querySelector('.flex-wrap')).not.toBeNull()
    expect(html).not.toMatch(/overflow-x-(auto|scroll)/)
  })
})
