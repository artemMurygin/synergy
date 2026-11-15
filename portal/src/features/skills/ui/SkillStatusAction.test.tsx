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

describe('SkillStatusAction', () => {
  it.each([
    ['planned', 'В разработку'],
    ['in_dev', 'На тестирование'],
    ['testing', 'Запустить']
  ] as const)('for %s offers only "%s"', (status, label) => {
    renderAction({ ...skillFixture, status })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: label })).toBeTruthy()
  })

  it('is hidden for a launched skill', () => {
    renderAction({ ...skillFixture, status: 'launched' })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Финальный статус')).toBeTruthy()
    expect(screen.getByText('Запущено')).toBeTruthy()
  })

  it('posts the next status and shows the new value', async () => {
    const { calls } = stubFetch(() => json({ ...skillFixture, status: 'in_dev' }))
    renderAction(skillFixture)
    expect(screen.getByText('Запланировано')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'В разработку' }))
    expect(await screen.findByText('В разработке')).toBeTruthy()
    expect(calls[0]).toMatchObject({ path: '/portal/skills/s1/status', body: { status: 'in_dev' } })
    expect(screen.getByRole('button', { name: 'На тестирование' })).toBeTruthy()
  })

  it('on 409 shows the message and the actual state', async () => {
    stubFetch(() => json({ message: 'x' }, 409))
    const { rerender } = renderAction(skillFixture)
    await userEvent.click(screen.getByRole('button', { name: 'В разработку' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/уже изменён/)
    expect(screen.getByText('Запланировано')).toBeTruthy()
    rerender({ ...skillFixture, status: 'testing' })
    expect(screen.getByText('Тестируется')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeTruthy()
  })
})
