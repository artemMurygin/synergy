import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { emptyGuideFixture, guideFixture } from '../model/guides.fixtures'
import { agentGuideQuery } from '../model/guides.queries'
import { AgentGuideSection } from './AgentGuideSection'
import { GuideView } from './GuideView'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderSection(canEdit: boolean, client = createTestClient()) {
  const Wrapper = queryWrapper(client)
  render(
    <Wrapper>
      <AgentGuideSection agentId="a1" canEdit={canEdit} />
    </Wrapper>
  )
  return client
}

describe('GuideView', () => {
  it('renders the markdown, the "Изменено" caption and limits the text width to 760', () => {
    const { container } = render(<GuideView guide={guideFixture} />)
    expect(screen.getByRole('heading', { name: 'Как работать с агентом' })).toBeTruthy()
    expect(screen.getByText('Изменено 10 ноября · Иванов Иван Иванович')).toBeTruthy()
    expect(container.querySelector('.max-w-\\[760px\\]')).not.toBeNull()
  })
})

describe('AgentGuideSection', () => {
  it('shows a skeleton on the first load and then the guide', async () => {
    stubFetch(() => json(guideFixture))
    renderSection(false)
    expect(screen.getByRole('status', { name: 'Загружаем инструкцию…' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Как работать с агентом' })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Инструкция' })).toBeTruthy()
  })

  it('shows an error with "Повторить" that reloads the guide', async () => {
    let fail = true
    stubFetch(() => (fail ? json({ message: 'x' }, 500) : json(guideFixture)))
    renderSection(true)
    expect(await screen.findByText('Не удалось загрузить инструкцию')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('heading', { name: 'Как работать с агентом' })).toBeTruthy()
  })

  it('keeps showing the loaded guide when a background refetch fails', async () => {
    let fail = false
    stubFetch(() => (fail ? json({ message: 'x' }, 500) : json(guideFixture)))
    const client = renderSection(false)
    await screen.findByRole('heading', { name: 'Как работать с агентом' })
    fail = true
    await client.refetchQueries({ queryKey: agentGuideQuery('a1').queryKey })
    expect(screen.getByRole('heading', { name: 'Как работать с агентом' })).toBeTruthy()
    expect(screen.queryByText('Не удалось загрузить инструкцию')).toBeNull()
  })

  it('shows "Инструкции пока нет" to an employee without any edit action', async () => {
    stubFetch(() => json(emptyGuideFixture))
    renderSection(false)
    expect(await screen.findByText('Инструкции пока нет')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Написать инструкцию' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull()
  })

  it('offers "Написать инструкцию" to an editor when there is no guide', async () => {
    stubFetch(() => json(emptyGuideFixture))
    renderSection(true)
    await userEvent.click(await screen.findByRole('button', { name: 'Написать инструкцию' }))
    expect(screen.getByRole('textbox', { name: 'Текст инструкции' })).toBeTruthy()
  })

  it('offers "Изменить" only to an editor and opens the editor with the current text', async () => {
    stubFetch(() => json(guideFixture))
    renderSection(false)
    await screen.findByRole('heading', { name: 'Как работать с агентом' })
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull()
    cleanup()
    renderSection(true)
    await userEvent.click(await screen.findByRole('button', { name: 'Изменить' }))
    expect((screen.getByRole('textbox', { name: 'Текст инструкции' }) as HTMLTextAreaElement).value).toBe(guideFixture.body)
  })

  it('returns to the view after the editor is cancelled', async () => {
    stubFetch(() => json(guideFixture))
    renderSection(true)
    await userEvent.click(await screen.findByRole('button', { name: 'Изменить' }))
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(await screen.findByRole('button', { name: 'Изменить' })).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
