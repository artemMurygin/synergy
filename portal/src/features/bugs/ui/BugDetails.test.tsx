import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { bugFixture } from '../model/bugs.fixtures'
import type { Bug } from '../model/bugs.schema'
import { BugDetails } from './BugDetails'

afterEach(cleanup)

function renderDetails(bug: Bug, props: Partial<React.ComponentProps<typeof BugDetails>> = {}) {
  return render(
    <MemoryRouter>
      <BugDetails bug={bug} {...props} />
    </MemoryRouter>
  )
}

describe('BugDetails', () => {
  it('shows the title, status, product, agent link, author and the date', () => {
    renderDetails(bugFixture)
    expect(screen.getByRole('heading', { level: 1, name: 'Ассистент не отвечает' })).toBeTruthy()
    expect(screen.getByText('Открыт')).toBeTruthy()
    expect(screen.getByText('Manager Helper')).toBeTruthy()
    expect(screen.getByText('Иванов Иван Иванович')).toBeTruthy()
    expect(screen.getAllByText(/10 ноября 2026/).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /Ассистент/ }).getAttribute('href')).toBe('/catalog/agents/a1')
    expect(screen.getByRole('link', { name: 'Поддержка' }).getAttribute('href')).toBe('/bugs')
  })

  it('shows the agent as plain text when it is archived', () => {
    renderDetails(bugFixture, { agentArchived: true })
    expect(screen.getByText('Ассистент')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Ассистент/ })).toBeNull()
  })

  it('keeps line breaks of the description and renders it as text', () => {
    renderDetails({ ...bugFixture, description: 'Первая строка\n<b>вторая</b>' })
    const text = screen.getByText(/Первая строка/)
    expect(text.className).toContain('whitespace-pre-wrap')
    expect(text.textContent).toBe('Первая строка\n<b>вторая</b>')
    expect(text.querySelector('b')).toBeNull()
  })

  it('shows the reason for wont_fix and no reason block otherwise', () => {
    const { unmount } = renderDetails({ ...bugFixture, status: 'wont_fix', wontFixReason: 'Это повтор', nextStatuses: [] })
    expect(screen.getByText('Не будет исправлен')).toBeTruthy()
    expect(screen.getByText('Почему не будет исправлено')).toBeTruthy()
    expect(screen.getByText('Это повтор')).toBeTruthy()
    unmount()
    renderDetails(bugFixture)
    expect(screen.queryByText('Почему не будет исправлено')).toBeNull()
  })

  it('renders the actions and comments slots; with actions leads back to the queue', () => {
    renderDetails(bugFixture, { actions: <p>слот действий</p>, comments: <p>слот комментариев</p> })
    expect(screen.getByText('слот действий')).toBeTruthy()
    expect(screen.getByText('слот комментариев')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Баги' }).getAttribute('href')).toBe('/bugs/queue')
  })
})
