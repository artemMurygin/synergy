import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { json, queryWrapper, skillFixture, stubFetch } from '@/test/helpers'
import type { Skill } from '@/lib/schemas'
import { SkillStatusAction } from './SkillStatusAction'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'], fullName: 'dev', lastName: null, firstName: null, middleName: null, position: null, department: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderAction(skill: Skill) {
  const Wrapper = queryWrapper()
  const view = render(
    <Wrapper>
      <SkillStatusAction skill={skill} />
    </Wrapper>
  )
  return {
    rerender: (next: Skill) =>
      view.rerender(
        <Wrapper>
          <SkillStatusAction skill={next} />
        </Wrapper>
      )
  }
}

const NEXT = {
  planned: ['in_dev'],
  in_dev: ['testing'],
  testing: ['launched', 'rework'],
  launched: ['rework'],
  rework: ['testing']
} as const

const at = (status: Skill['status']): Skill => ({ ...skillFixture, status, nextStatuses: [...NEXT[status]] })

describe('SkillStatusAction', () => {
  it.each([
    ['planned', ['В разработку']],
    ['in_dev', ['На тестирование']],
    ['testing', ['На доработку', 'Запустить']],
    ['launched', ['На доработку']],
    ['rework', ['На тестирование']]
  ] as const)('for %s offers the actions from nextStatuses %j', (status, labels) => {
    renderAction(at(status))
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(labels)
  })

  it('has no actions when nextStatuses is empty and no "final status" label', () => {
    renderAction({ ...at('launched'), nextStatuses: [] })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('Финальный статус')).toBeNull()
    expect(screen.getByText('Запущено')).toBeTruthy()
  })

  it('posts the chosen status and shows the new value with its next steps', async () => {
    const { calls } = stubFetch(() => json({ ...at('in_dev'), statusChangedAt: '2026-11-03T09:00:00.000Z' }))
    renderAction(skillFixture)
    expect(screen.getByText('Запланировано')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'В разработку' }))
    expect(await screen.findByText('В разработке')).toBeTruthy()
    expect(calls[0]).toMatchObject({ path: '/portal/skills/s1/status', body: { status: 'in_dev' } })
    expect(screen.getByRole('button', { name: 'На тестирование' })).toBeTruthy()
  })

  it('posts rework from the "На доработку" button', async () => {
    const { calls } = stubFetch(() => json({ ...at('rework'), statusChangedAt: '2026-11-03T09:00:00.000Z' }))
    renderAction(at('launched'))
    await userEvent.click(screen.getByRole('button', { name: 'На доработку' }))
    expect(await screen.findByText('Доработка')).toBeTruthy()
    expect(calls[0]?.body).toEqual({ status: 'rework' })
  })

  it('picks the actual status by statusChangedAt, not by the order of the chain', async () => {
    stubFetch(() => json({ ...at('rework'), statusChangedAt: '2026-11-03T09:00:00.000Z' }))
    const { rerender } = renderAction(at('launched'))
    await userEvent.click(screen.getByRole('button', { name: 'На доработку' }))
    expect(await screen.findByText('Доработка')).toBeTruthy()
    // an older server state does not override the newer answer
    rerender({ ...at('launched'), statusChangedAt: '2026-11-02T09:00:00.000Z' })
    expect(screen.getByText('Доработка')).toBeTruthy()
    // a newer state from the list wins
    rerender({ ...at('testing'), statusChangedAt: '2026-11-05T09:00:00.000Z' })
    expect(screen.getByText('Тестируется')).toBeTruthy()
  })

  it('on 409 shows the message and the actual state', async () => {
    stubFetch(() => json({ message: 'x' }, 409))
    const { rerender } = renderAction(skillFixture)
    await userEvent.click(screen.getByRole('button', { name: 'В разработку' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/уже изменён/)
    expect(screen.getByText('Запланировано')).toBeTruthy()
    rerender({ ...at('testing'), statusChangedAt: '2026-11-05T09:00:00.000Z' })
    expect(screen.getByText('Тестируется')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'На доработку' })).toBeTruthy()
  })
})
