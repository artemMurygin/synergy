import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { agentFixture, json, page, queryWrapper, skillFixture, stubFetch } from '@/test/helpers'
import { SkillPicker, type SkillPickerValue } from './SkillPicker'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'u1', login: 'dev', mustChangePassword: false, roles: ['developer'] })
  stubFetch(({ path }) => (path === '/portal/agents' ? json([agentFixture]) : json(page([skillFixture]))))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const EXISTING: SkillPickerValue = { mode: 'existing', skillId: '' }

function Harness({ onChange }: { onChange: (v: SkillPickerValue) => void }) {
  const [value, setValue] = useState<SkillPickerValue>(EXISTING)
  return (
    <SkillPicker
      value={value}
      onChange={(v) => {
        setValue(v)
        onChange(v)
      }}
    />
  )
}

function renderPicker(onChange = vi.fn()) {
  const Wrapper = queryWrapper()
  render(
    <Wrapper>
      <Harness onChange={onChange} />
    </Wrapper>
  )
  return onChange
}

describe('SkillPicker', () => {
  it('picks an existing skill', async () => {
    const onChange = renderPicker()
    const user = userEvent.setup()
    await screen.findByRole('option', { name: /Сводка встречи/ })
    await user.selectOptions(screen.getByLabelText('Навык'), 's1')
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'existing', skillId: 's1' })
  })

  it('creates a new skill with an agent, showing the agent product', async () => {
    const onChange = renderPicker()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Новый навык' }))
    await user.selectOptions(await screen.findByLabelText('Агент'), 'a1')
    expect(screen.getByText(/Manager Helper/)).toBeTruthy()
    await user.type(screen.getByLabelText('Название навыка'), 'Сверка')
    await user.type(screen.getByLabelText('Что делает'), 'Опис')
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'new', agentId: 'a1', name: 'Сверка', description: 'Опис' })
  })

  it('shows field errors passed from the panel', () => {
    const Wrapper = queryWrapper()
    render(
      <Wrapper>
        <SkillPicker
          value={{ mode: 'new', agentId: '', name: '', description: '' }}
          onChange={() => undefined}
          errors={{ agentId: 'Выберите агента', name: 'Введите название' }}
        />
      </Wrapper>
    )
    expect(screen.getByLabelText('Агент').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Введите название')).toBeTruthy()
  })
})
