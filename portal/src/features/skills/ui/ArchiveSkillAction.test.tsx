import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { createTestClient, json, page, queryWrapper, skillFixture, stubFetch } from '@/test/helpers'
import { skillsQuery } from '../model/skills.queries'
import { ArchiveSkillAction } from './ArchiveSkillAction'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'], fullName: 'dev', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderAction() {
  const client = createTestClient()
  client.setQueryData(skillsQuery(undefined, 0).queryKey, page([skillFixture, { ...skillFixture, id: 's2' }]))
  const spy = vi.spyOn(client, 'invalidateQueries')
  const Wrapper = queryWrapper(client)
  render(
    <Wrapper>
      <ArchiveSkillAction skillId="s1" skillName="Сводка встречи" />
    </Wrapper>
  )
  return { client, spy }
}

const open = () => userEvent.click(screen.getByRole('button', { name: 'Архивировать навык «Сводка встречи»' }))

describe('ArchiveSkillAction', () => {
  it('asks for confirmation first and sends nothing on cancel', async () => {
    const { calls } = stubFetch(() => json(skillFixture))
    renderAction()
    await open()
    expect(screen.getByRole('alertdialog').textContent).toMatch(/Архивировать навык «Сводка встречи»\?/)
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(calls).toHaveLength(0)
  })

  it('on confirm posts the archive, removes the skill from the list and invalidates caches', async () => {
    const { calls } = stubFetch(() => json({ ...skillFixture, archivedAt: '2026-11-10T09:00:00.000Z' }))
    const { client, spy } = renderAction()
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Архивировать' }))
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/portal/skills/s1/archive' })
    const cached = client.getQueryData(skillsQuery(undefined, 0).queryKey)
    expect(cached?.items.map((s) => s.id)).toEqual(['s2'])
    for (const key of ['skills', 'catalog', 'archive']) expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: [key] }))
  })

  it('shows the error', async () => {
    stubFetch(() => json({ message: 'Сбой сервера' }, 500))
    renderAction()
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Архивировать' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Сбой сервера/)
  })
})
