import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismissedEmployeeFixture, employeeFixture } from '../model/employees.fixtures'
import { DismissAction, type DismissActionProps } from './DismissAction'

afterEach(cleanup)

function setup(props: Partial<DismissActionProps> = {}) {
  const onDismiss = vi.fn<() => Promise<unknown> | void>()
  const onRestore = vi.fn<() => Promise<unknown> | void>()
  render(<DismissAction employee={employeeFixture} onDismiss={onDismiss} onRestore={onRestore} {...props} />)
  return { onDismiss, onRestore }
}

const dialog = () => screen.getByRole('alertdialog')

describe('DismissAction · active employee', () => {
  it('says the employee can sign in and offers "Уволить"', () => {
    setup()
    expect(screen.getByText('Сотрудник может входить в портал')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Уволить' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Вернуть' })).toBeNull()
  })

  it('has no delete action anywhere', async () => {
    setup()
    expect(screen.queryByRole('button', { name: /удалить/i })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    expect(screen.queryByRole('button', { name: /удалить/i })).toBeNull()
  })

  it('asks for confirmation first: nothing is sent when the button is pressed', async () => {
    const { onDismiss } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    expect(onDismiss).not.toHaveBeenCalled()
    expect(dialog()).toBeTruthy()
  })

  it('names the employee in the title and says what happens', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    expect(screen.getByRole('alertdialog', { name: 'Уволить Иванов Иван Петрович?' })).toBeTruthy()
    const text = dialog().textContent ?? ''
    expect(text).toContain('Сотрудник потеряет доступ к порталу')
    expect(text).toContain('текущие сессии будут завершены')
    expect(text).toContain('Его заявки и данные сохранятся')
    expect(text).toContain('вернуть доступ можно в любой момент')
  })

  it('puts the focus on the safe "Отмена"', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: 'Отмена' }))
  })

  it('"Отмена" closes the dialog, changes nothing and returns the focus to "Уволить"', async () => {
    const { onDismiss } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onDismiss).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Уволить' }))
  })

  it('"Esc" closes the dialog without dismissing', async () => {
    const { onDismiss } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('does not warn about losing access in someone else\'s card', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    expect(screen.queryByText('Вы потеряете доступ к порталу')).toBeNull()
  })

  it('confirming calls onDismiss, shows "Увольняем…" disabled meanwhile and closes when it is done', async () => {
    let finish: () => void = () => undefined
    const { onDismiss } = setup({ onDismiss: vi.fn(() => new Promise<void>((resolve) => (finish = resolve))) })
    void onDismiss
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Уволить' }))
    const busy = within(dialog()).getByRole('button', { name: 'Увольняем…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    expect((within(dialog()).getByRole('button', { name: 'Отмена' }) as HTMLButtonElement).disabled).toBe(true)
    finish()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('calls onDismiss exactly once', async () => {
    const onDismiss = vi.fn(() => Promise.resolve())
    setup({ onDismiss })
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Уволить' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('closes the dialog when the request fails too', async () => {
    setup({ onDismiss: vi.fn(() => Promise.reject(new Error('409'))) })
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Уволить' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Уволить' })).toBeTruthy()
  })

  it('in the own card adds the warning "Вы потеряете доступ к порталу" to the dialog', async () => {
    setup({ isSelf: true })
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    expect(within(dialog()).getByText('Вы потеряете доступ к порталу')).toBeTruthy()
  })

  it('shows "Сотрудник уволен" after the dismissal succeeded', () => {
    setup({ employee: dismissedEmployeeFixture, success: 'dismissed' })
    expect(screen.getByText('Сотрудник уволен')).toBeTruthy()
  })

  it('on LAST_ADMIN shows the message in the card and keeps the employee active', () => {
    setup({ lastAdminError: true })
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Нельзя оставить систему без администратора')).toBeTruthy()
    expect(within(alert).getByText('Сначала выдайте роль «Администратор» другому активному сотруднику')).toBeTruthy()
    expect(screen.getByText('Сотрудник может входить в портал')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Уволить' })).toBeTruthy()
  })

  it('on LAST_ADMIN orders the card as the design: title, text, red notice, button', () => {
    setup({ lastAdminError: true })
    const title = screen.getByRole('heading', { name: 'Доступ' })
    const text = screen.getByText('Сотрудник может входить в портал')
    const alert = screen.getByRole('alert')
    const button = screen.getByRole('button', { name: 'Уволить' })
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(title, text)).toBe(true)
    expect(before(text, alert)).toBe(true)
    expect(before(alert, button)).toBe(true)
  })

  it('shows a general error as an alert', () => {
    setup({ error: 'Не удалось уволить сотрудника' })
    expect(within(screen.getByRole('alert')).getByText('Не удалось уволить сотрудника')).toBeTruthy()
  })
})

describe('DismissAction · dismissed employee', () => {
  it('says the employee cannot sign in and offers only "Вернуть"', () => {
    setup({ employee: dismissedEmployeeFixture })
    expect(screen.getByText('Сотрудник уволен и не может войти. Заявки и данные сохранены')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Вернуть' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Уволить' })).toBeNull()
    expect(screen.queryByRole('button', { name: /удалить/i })).toBeNull()
  })

  it('"Вернуть" restores without a confirmation', async () => {
    const { onRestore } = setup({ employee: dismissedEmployeeFixture })
    await userEvent.click(screen.getByRole('button', { name: 'Вернуть' }))
    expect(onRestore).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('disables "Вернуть" while the request runs', async () => {
    let finish: () => void = () => undefined
    setup({ employee: dismissedEmployeeFixture, onRestore: vi.fn(() => new Promise<void>((resolve) => (finish = resolve))) })
    await userEvent.click(screen.getByRole('button', { name: 'Вернуть' }))
    expect((screen.getByRole('button', { name: 'Возвращаем…' }) as HTMLButtonElement).disabled).toBe(true)
    finish()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Вернуть' })).toBeTruthy())
  })

  it('survives a failed restore', async () => {
    setup({ employee: dismissedEmployeeFixture, onRestore: vi.fn(() => Promise.reject(new Error('boom'))) })
    await userEvent.click(screen.getByRole('button', { name: 'Вернуть' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Вернуть' })).toBeTruthy())
  })

  it('shows "Доступ возвращён. Пароль прежний" after the restore succeeded', () => {
    setup({ employee: employeeFixture, success: 'restored' })
    expect(screen.getByText('Доступ возвращён. Пароль прежний')).toBeTruthy()
    expect(screen.getByText('Сотрудник может входить в портал')).toBeTruthy()
  })
})

describe('DismissAction · own card warning block', () => {
  it('renders the warning as a status block with an icon and the title', async () => {
    setup({ isSelf: true })
    await userEvent.click(screen.getByRole('button', { name: 'Уволить' }))
    const block = within(dialog()).getByRole('status')
    expect(block.textContent).toBe('Вы потеряете доступ к порталу')
    expect(block.className).toContain('bg-brand-red-soft')
    expect(block.className).toContain('gap-2.5')
    expect(block.querySelector('svg')).toBeTruthy()
  })
})
