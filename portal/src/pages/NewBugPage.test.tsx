import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { catalogFixture } from '@/features/catalog/model/catalog.fixtures'
import { bugFixture } from '@/features/bugs/model/bugs.fixtures'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { NewBugPage } from './NewBugPage'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'ivan', mustChangePassword: false, roles: [], fullName: 'ivan', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage(url: string) {
  const Wrapper = queryWrapper(createTestClient())
  render(
    <Wrapper>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/bugs/new" element={<NewBugPage />} />
          <Route path="/bugs/:id" element={<p>страница бага</p>} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  )
}

describe('NewBugPage', () => {
  it('takes products from the catalog and preselects the agent from the URL', async () => {
    stubFetch(() => json(catalogFixture))
    renderPage('/bugs/new?agentId=a-analyst')
    const product = (await screen.findByLabelText('Продукт')) as HTMLSelectElement
    expect(product.value).toBe('p-cc')
    expect((screen.getByLabelText('Агент') as HTMLSelectElement).value).toBe('a-analyst')
  })

  it('opens the created bug after a successful report', async () => {
    stubFetch((c) => (c.method === 'POST' ? json(bugFixture, 201) : json(catalogFixture)))
    renderPage('/bugs/new?agentId=a-analyst')
    const user = userEvent.setup()
    await screen.findByLabelText('Продукт')
    await user.type(screen.getByLabelText(/Что случилось/), 'Не отвечает')
    await user.type(screen.getByLabelText(/Подробности/), 'Нажал отправить')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByText('страница бага')).toBeTruthy()
  })
})
