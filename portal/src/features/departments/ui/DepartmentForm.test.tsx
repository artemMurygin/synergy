import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth'
import { json, page, queryWrapper, stubFetch } from '@/test/helpers'
import { departmentFixture, departmentWithoutHead, employeeOptionFixtures } from '../model/fixtures'
import { DepartmentForm, type DepartmentFormProps } from './DepartmentForm'

beforeEach(() => {
  useSessionStore.setState(useSessionStore.getInitialState())
  useSessionStore.getState().signIn('tok', { id: 'a1', login: 'admin', mustChangePassword: false, roles: ['admin'], fullName: 'admin', lastName: null, firstName: null, middleName: null, position: null, department: null })
  stubFetch(() => json(page(employeeOptionFixtures)))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup(props: Partial<DepartmentFormProps> = {}) {
  const onSubmit = vi.fn()
  const onClose = vi.fn()
  const Wrapper = queryWrapper()
  const element = (extra: Partial<DepartmentFormProps> = {}) => (
    <Wrapper>
      <DepartmentForm open onSubmit={onSubmit} onClose={onClose} {...props} {...extra} />
    </Wrapper>
  )
  const view = render(element())
  return { onSubmit, onClose, rerender: (extra: Partial<DepartmentFormProps>) => view.rerender(element(extra)) }
}

describe('DepartmentForm', () => {
  it('renders nothing while closed', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('create mode: title "Новый отдел", focus on the name, button "Создать"', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Новый отдел' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('Название'))
    expect(screen.getByRole('button', { name: 'Создать' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeTruthy()
    expect(screen.getByRole('combobox').textContent).toContain('Не назначен')
  })

  it('edit mode: title with the name, current values, button "Сохранить"', () => {
    setup({ department: departmentFixture })
    expect(screen.getByRole('dialog', { name: 'Отдел Продажи' })).toBeTruthy()
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Продажи')
    expect(screen.getByRole('combobox').textContent).toContain('Петрова Мария Сергеевна')
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeTruthy()
  })

  it('submits the trimmed name without a head', async () => {
    const { onSubmit } = setup()
    await userEvent.type(screen.getByLabelText('Название'), '  Закупки  ')
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Закупки', headUserId: null })
  })

  it('submits the chosen head', async () => {
    const { onSubmit } = setup()
    await userEvent.type(screen.getByLabelText('Название'), 'Закупки')
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: /Полякова/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Закупки', headUserId: 'u-polyakova' })
  })

  it('edit mode submits null when the head is removed', async () => {
    const { onSubmit } = setup({ department: departmentFixture })
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: /Снять руководителя/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Продажи', headUserId: null })
  })

  it('blocks an empty name before sending', async () => {
    const { onSubmit } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Укажите название')).toBeTruthy()
    expect(screen.getByLabelText('Название').getAttribute('aria-invalid')).toBe('true')
  })

  it('moves focus to the name when validation fails', async () => {
    setup()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Название'))
  })

  it('blocks a whitespace-only name', async () => {
    const { onSubmit } = setup()
    await userEvent.type(screen.getByLabelText('Название'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Укажите название')).toBeTruthy()
  })

  it('blocks a name longer than 200 characters but accepts exactly 200', async () => {
    const { onSubmit } = setup()
    const input = screen.getByLabelText('Название')
    await userEvent.click(input)
    await userEvent.paste('я'.repeat(201))
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Не длиннее 200 символов')).toBeTruthy()
    await userEvent.clear(input)
    await userEvent.paste('я'.repeat(200))
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'я'.repeat(200), headUserId: null })
  })

  it('shows the 409 on the name next to the field and keeps the entered values', async () => {
    const { rerender } = setup({ department: departmentWithoutHead })
    const input = screen.getByLabelText('Название')
    await userEvent.clear(input)
    await userEvent.type(input, 'Маркетинг')
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: /Петрова/ }))
    rerender({ department: departmentWithoutHead, errors: { name: 'Отдел с таким названием уже есть' } })
    expect(screen.getByText('Отдел с таким названием уже есть')).toBeTruthy()
    expect(screen.getByLabelText('Название').getAttribute('aria-invalid')).toBe('true')
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Маркетинг')
    expect(screen.getByRole('combobox').textContent).toContain('Петрова Мария Сергеевна')
  })

  it('shows the 404 on the head next to the picker and keeps the values', () => {
    setup({ department: departmentFixture, errors: { head: 'Сотрудник не найден, выберите другого' } })
    expect(screen.getByText('Сотрудник не найден, выберите другого')).toBeTruthy()
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Продажи')
    expect(screen.getByRole('combobox').textContent).toContain('Петрова Мария Сергеевна')
  })

  it('shows a general error as an alert', () => {
    setup({ errors: { general: 'Сервер недоступен' } })
    expect(within(screen.getByRole('alert')).getByText('Сервер недоступен')).toBeTruthy()
  })

  it('disables the actions while pending and shows "Создаём…" on creation', () => {
    setup({ pending: true })
    expect((screen.getByRole('button', { name: 'Создаём…' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Отмена' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Создать' })).toBeNull()
  })

  it('shows "Сохраняем…" while pending on edit', () => {
    setup({ pending: true, department: departmentFixture })
    expect((screen.getByRole('button', { name: 'Сохраняем…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('"Отмена" closes', async () => {
    const { onClose } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('starts empty again after closing and reopening', () => {
    const { rerender } = setup()
    rerender({ open: false })
    rerender({ open: true })
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('')
  })

  it('hints are 12px ink-60', () => {
    setup()
    for (const text of ['обязательно', 'необязательно']) {
      const hint = screen.getByText(text)
      expect(hint.className).toContain('text-ink-60')
      expect(hint.className).not.toContain('text-ink-40')
    }
  })

  it('uses the compact 360 sheet: 16px paddings, 10px gap and 48px buttons', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    const cancel = screen.getByRole('button', { name: 'Отмена' })
    const footer = cancel.parentElement!
    expect(footer.className).toContain('px-4')
    expect(footer.className).toContain('gap-2.5')
    expect(footer.className).toContain('pb-6')
    expect(cancel.className).toContain('h-12')
    expect(cancel.className).toContain('sm:h-11')
    expect(screen.getByRole('button', { name: 'Создать' }).className).toContain('h-12')
    expect(dialog.querySelector('h2')!.parentElement!.className).toContain('pl-4')
    expect(screen.getByLabelText('Название').closest('form')!.parentElement!.className).toContain('px-4')
  })
})
