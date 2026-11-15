import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Role } from '@/lib/schemas'
import { RolesEditor, type RolesEditorProps } from './RolesEditor'

afterEach(cleanup)

function setup(props: Partial<RolesEditorProps> = {}) {
  const onSave = vi.fn()
  const element = (extra: Partial<RolesEditorProps> = {}) => <RolesEditor roles={['developer']} onSave={onSave} {...props} {...extra} />
  const view = render(element())
  return { onSave, rerender: (extra: Partial<RolesEditorProps>) => view.rerender(element(extra)) }
}

const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement
const save = () => screen.getByRole('button', { name: /Сохранить роли|Сохраняем/ }) as HTMLButtonElement

describe('RolesEditor', () => {
  it('is a group "Роли" with the two roles and their explanations', () => {
    setup()
    const group = screen.getByRole('group', { name: 'Роли' })
    expect(within(group).getByRole('checkbox', { name: 'Разработчик' })).toBeTruthy()
    expect(within(group).getByRole('checkbox', { name: 'Администратор' })).toBeTruthy()
    expect(screen.getByText('очередь заявок и навыки')).toBeTruthy()
    expect(screen.getByText('сотрудники и отделы')).toBeTruthy()
  })

  it('checks the roles the employee has', () => {
    setup({ roles: ['admin'] })
    expect(checkbox('Разработчик').checked).toBe(false)
    expect(checkbox('Администратор').checked).toBe(true)
  })

  it('always shows the delay hint without a number and ties it to the group', () => {
    setup()
    const hint = screen.getByText(/Изменение вступит в силу не сразу/)
    expect(hint.textContent).toContain('после обновления его сессии')
    expect(hint.textContent).not.toMatch(/\d/)
    const group = screen.getByRole('group', { name: 'Роли' })
    expect(group.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(group.getAttribute('aria-describedby') ?? '')?.textContent).toContain('Изменение вступит в силу не сразу')
  })

  it('keeps "Сохранить роли" disabled until the set changes', async () => {
    const { onSave } = setup()
    expect(save().disabled).toBe(true)
    await userEvent.click(checkbox('Администратор'))
    expect(save().disabled).toBe(false)
    await userEvent.click(checkbox('Администратор'))
    expect(save().disabled).toBe(true)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves the whole set', async () => {
    const { onSave } = setup()
    await userEvent.click(checkbox('Администратор'))
    await userEvent.click(save())
    expect(onSave).toHaveBeenCalledWith(['developer', 'admin'] satisfies Role[])
  })

  it('can save an empty set', async () => {
    const { onSave } = setup()
    await userEvent.click(checkbox('Разработчик'))
    await userEvent.click(save())
    expect(onSave).toHaveBeenCalledWith([])
  })

  it('shows "Роли сохранены" as a status after saving', () => {
    setup({ saved: true })
    expect(screen.getByText('Роли сохранены')).toBeTruthy()
  })

  it('on LAST_ADMIN shows the message and returns to the server set', async () => {
    const { rerender } = setup({ roles: ['admin'] })
    await userEvent.click(checkbox('Администратор'))
    expect(checkbox('Администратор').checked).toBe(false)
    rerender({ roles: ['admin'], lastAdminError: true })
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Нельзя оставить систему без администратора')).toBeTruthy()
    expect(within(alert).getByText('Сначала выдайте роль «Администратор» другому активному сотруднику')).toBeTruthy()
    expect(checkbox('Администратор').checked).toBe(true)
    expect(save().disabled).toBe(true)
  })

  it('follows a new set of roles from the server', () => {
    const { rerender } = setup({ roles: ['developer'] })
    rerender({ roles: ['developer', 'admin'] })
    expect(checkbox('Администратор').checked).toBe(true)
  })

  it('shows a general error as an alert', () => {
    setup({ error: 'Не удалось сохранить роли' })
    expect(within(screen.getByRole('alert')).getByText('Не удалось сохранить роли')).toBeTruthy()
  })

  it('shows "Сохраняем…" and disables the button while pending', () => {
    setup({ pending: true })
    expect(save().textContent).toBe('Сохраняем…')
    expect(save().disabled).toBe(true)
  })

  it('never shows a role name in Latin', () => {
    setup({ roles: ['admin', 'developer'] })
    expect(screen.queryByText(/\b(admin|developer)\b/)).toBeNull()
  })
})
