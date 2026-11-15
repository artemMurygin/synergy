import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { IdeaRequest } from '@/lib/schemas'
import { requestFixture } from '@/test/helpers'
import { RequestDetails } from './RequestDetails'

afterEach(cleanup)

function renderDetails(request: IdeaRequest, decision?: React.ReactNode) {
  return render(
    <MemoryRouter>
      <RequestDetails request={request} decision={decision} />
    </MemoryRouter>
  )
}

describe('RequestDetails', () => {
  it('shows the questionnaire of a pending request', () => {
    renderDetails(requestFixture)
    expect(screen.getByRole('heading', { name: 'Сверка актов' })).toBeTruthy()
    expect(screen.getByText('Сверяю акты вручную')).toBeTruthy()
    expect(screen.getByText('20 мин')).toBeTruthy()
    expect(screen.getByText('3 чел.')).toBeTruthy()
    expect(screen.getByText('5 / нед')).toBeTruthy()
    expect(screen.getByText(/^≈ \d/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Мои заявки' }).getAttribute('href')).toBe('/requests')
    expect(screen.queryByText(/Почему отклонена/)).toBeNull()
  })

  it('for a developer (decision panel given) leads back to the queue and has no author history', () => {
    renderDetails(requestFixture, <p>панель</p>)
    expect(screen.getByRole('link', { name: 'Очередь заявок' }).getAttribute('href')).toBe('/queue')
    expect(screen.queryByText('Вы подали заявку')).toBeNull()
  })

  it('does not repeat the author name in the meta line of the author own request', () => {
    const { container } = renderDetails(requestFixture)
    expect(container.querySelector('header p')?.textContent).not.toContain(requestFixture.author.fullName)
  })

  it('shows the 6-step path with the current step marked', () => {
    renderDetails({ ...requestFixture, status: { code: 'in_dev', label: 'В разработке' } })
    const steps = within(screen.getByRole('list', { name: 'Путь заявки' })).getAllByRole('listitem')
    expect(steps.map((s) => s.textContent)).toEqual([
      expect.stringContaining('Новая'),
      expect.stringContaining('На рассмотрении'),
      expect.stringContaining('Запланировано'),
      expect.stringContaining('В разработке'),
      expect.stringContaining('Тестируется'),
      expect.stringContaining('Запущено')
    ])
    expect(steps[3]?.getAttribute('aria-current')).toBe('step')
    expect(screen.getByText('шаг 4 из 6')).toBeTruthy()
  })

  it('shows the date of submission under "Новая" and the date and the name of the reviewer under "На рассмотрении"', () => {
    renderDetails(requestFixture)
    const steps = within(screen.getByRole('list', { name: 'Путь заявки' })).getAllByRole('listitem')
    expect(steps[0]?.textContent).toContain('10.11')
    expect(steps[1]?.textContent).toContain('11.11 · Петров Пётр')
    expect(steps[1]?.getAttribute('aria-current')).toBe('step')
    expect(screen.getByText('шаг 2 из 6')).toBeTruthy()
  })

  it('marks "Новая" as the current step of a request nobody has taken', () => {
    renderDetails({ ...requestFixture, status: { code: 'new', label: 'Новая' }, reviewer: null, takenAt: null })
    const steps = within(screen.getByRole('list', { name: 'Путь заявки' })).getAllByRole('listitem')
    expect(steps[0]?.getAttribute('aria-current')).toBe('step')
    expect(steps[1]?.textContent).toBe('На рассмотрении')
    expect(screen.getByText('шаг 1 из 6')).toBeTruthy()
    expect(screen.getByText(/ждёт решения/)).toBeTruthy()
    expect(screen.queryByText(/в работе у/)).toBeNull()
    expect(screen.getByText('Решение придёт уведомлением')).toBeTruthy()
  })

  it('names the reviewer and the taking date in the meta line', () => {
    renderDetails(requestFixture)
    expect(screen.getAllByText(/в работе у Петров Пётр с 11 ноября/).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Сверка актов' })).toBeTruthy()
  })

  it('shows the reject reason and a way to resubmit for a rejected request', () => {
    renderDetails({ ...requestFixture, status: { code: 'rejected', label: 'Отклонена' }, rejectReason: 'Уже есть в поставке' })
    expect(screen.getByText('Отклонена', { selector: 'span:not([class*="text-sm"])' })).toBeTruthy()
    expect(screen.getByText(/Почему отклонена/)).toBeTruthy()
    expect(screen.getByText('Уже есть в поставке')).toBeTruthy()
    expect(screen.getByText('завершена')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Подать уточнённую идею' }).getAttribute('href')).toBe('/ideas/new')
  })

  it('shows the name and description of the skill of an accepted request', () => {
    renderDetails({
      ...requestFixture,
      status: { code: 'in_dev', label: 'В разработке' },
      skill: { id: 's1', name: 'Сверка', description: 'Автоматически сверяет акты' }
    })
    expect(screen.getByText('Сверка')).toBeTruthy()
    expect(screen.getByText('Автоматически сверяет акты')).toBeTruthy()
  })

  it('shows the estimate of the developer in the skill card, a dash when there is none', () => {
    const accepted = {
      ...requestFixture,
      status: { code: 'planned' as const, label: 'Запланировано' },
      skill: { id: 's1', name: 'Сверка', description: 'Автоматически сверяет акты' }
    }
    renderDetails({ ...accepted, effortHours: 16 })
    expect(screen.getByText('Оценка разработчика')).toBeTruthy()
    expect(screen.getByText('16 ч')).toBeTruthy()
    cleanup()
    renderDetails({ ...accepted, effortHours: null })
    expect(screen.getByText('Оценка разработчика')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('does not show the estimate before the decision', () => {
    renderDetails({ ...requestFixture, effortHours: null })
    expect(screen.queryByText('Оценка разработчика')).toBeNull()
  })

  it('puts the decision panel into the side column instead of the author cards', () => {
    renderDetails(requestFixture, <p>decision-slot</p>)
    expect(screen.getByText('decision-slot')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Путь заявки' })).toBeNull()
  })
})
