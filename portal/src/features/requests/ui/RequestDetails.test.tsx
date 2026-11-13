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

  it('shows the status path with the current step marked', () => {
    renderDetails({ ...requestFixture, status: { code: 'in_dev', label: 'В разработке' } })
    const steps = within(screen.getByRole('list', { name: 'Путь заявки' })).getAllByRole('listitem')
    expect(steps.map((s) => s.textContent)).toEqual([
      expect.stringContaining('На рассмотрении'),
      expect.stringContaining('Запланировано'),
      expect.stringContaining('В разработке'),
      expect.stringContaining('Тестируется'),
      expect.stringContaining('Запущено')
    ])
    expect(steps[2]?.getAttribute('aria-current')).toBe('step')
    expect(screen.getByText('шаг 3 из 5')).toBeTruthy()
  })

  it('shows the pending status with the waiting note and the status badge', () => {
    renderDetails(requestFixture)
    expect(screen.getByText('шаг 1 из 5')).toBeTruthy()
    expect(screen.getByText(/ждёт решения/)).toBeTruthy()
    expect(screen.getByText('Решение придёт уведомлением')).toBeTruthy()
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

  it('puts the decision panel into the side column instead of the author cards', () => {
    renderDetails(requestFixture, <p>decision-slot</p>)
    expect(screen.getByText('decision-slot')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Путь заявки' })).toBeNull()
  })
})
