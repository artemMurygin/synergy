import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import type { Role } from '@/lib/schemas'
import { createTestClient, json, queryWrapper, stubFetch } from '@/test/helpers'
import { ArchiveAgentAction } from './ArchiveAgentAction'

const products = [
  { id: 'p-cc', slug: 'control-center', name: 'Control Center' },
  { id: 'p-tg', slug: 'telegram-bot', name: 'Telegram-бот' }
]

function signIn(roles: Role[]) {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles, fullName: 'dev', lastName: null, firstName: null, middleName: null, position: null, department: null })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderAction(opts: { products?: typeof products; onArchived?: () => void } = {}) {
  const client = createTestClient()
  const spy = vi.spyOn(client, 'invalidateQueries')
  const onArchived = opts.onArchived ?? vi.fn()
  const Wrapper = queryWrapper(client)
  render(
    <Wrapper>
      <MemoryRouter>
        <ArchiveAgentAction agentId="a1" agentName="Ассистент" products={opts.products ?? products} skillsCount={3} onArchived={onArchived} />
      </MemoryRouter>
    </Wrapper>
  )
  return { spy, onArchived }
}

const open = () => userEvent.click(screen.getByRole('button', { name: 'Архивировать агента' }))

describe('ArchiveAgentAction', () => {
  it('renders nothing for a user without the developer role', () => {
    signIn([])
    renderAction()
    expect(screen.queryByRole('button', { name: 'Архивировать агента' })).toBeNull()
  })

  it('asks for confirmation naming all products and the skills, and sends nothing on cancel', async () => {
    signIn(['developer'])
    const { calls } = stubFetch(() => json({}))
    renderAction()
    await open()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toMatch(/Архивировать агента «Ассистент»\?/)
    expect(dialog.textContent).toMatch(/скроется из всех своих продуктов — Control Center и Telegram-бот — вместе с 3 навыками/)
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(calls).toHaveLength(0)
  })

  it('names the single product when the agent has one', async () => {
    signIn(['developer'])
    renderAction({ products: [products[0]!] })
    await open()
    expect(screen.getByRole('alertdialog').textContent).toMatch(/скроется из Control Center вместе с 3 навыками/)
  })

  it('on confirm posts the archive, invalidates the caches and calls onArchived', async () => {
    signIn(['developer'])
    const agent = { id: 'a1', name: 'Ассистент', products }
    const { calls } = stubFetch(() => json(agent))
    const { spy, onArchived } = renderAction()
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Архивировать' }))
    await vi.waitFor(() => expect(onArchived).toHaveBeenCalled())
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/portal/agents/a1/archive' })
    for (const key of ['catalog', 'skills', 'agents', 'archive']) expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: [key] }))
  })

  it('shows the error and keeps the dialog open', async () => {
    signIn(['developer'])
    stubFetch(() => json({ message: 'Сбой сервера' }, 500))
    const { onArchived } = renderAction()
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Архивировать' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Сбой сервера/)
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(onArchived).not.toHaveBeenCalled()
  })
})
