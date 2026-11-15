import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { departmentDismissedHead, departmentFixture, emptyDepartment } from '../model/fixtures'
import { DeleteDepartmentDialog } from './DeleteDepartmentDialog'

afterEach(cleanup)

function setup(department = emptyDepartment, open = true) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(<DeleteDepartmentDialog open={open} department={department} onConfirm={onConfirm} onCancel={onCancel} />)
  return { onConfirm, onCancel }
}

describe('DeleteDepartmentDialog', () => {
  it('asks for confirmation with the department name', () => {
    setup()
    expect(screen.getByRole('alertdialog', { name: 'Удалить отдел «Юридический отдел»?' })).toBeTruthy()
    expect(screen.getByText('Отдел исчезнет из справочника. Удалить можно только отдел без сотрудников')).toBeTruthy()
  })

  it('puts focus on "Отмена"', () => {
    setup()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Отмена' }))
  })

  it('does not delete until confirmed', async () => {
    const { onConfirm, onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms with "Удалить"', async () => {
    const { onConfirm } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('warns about employees in a department that still has some (the button stays available)', async () => {
    const { onConfirm } = setup(departmentDismissedHead)
    expect(screen.getByText(/Сейчас в отделе 6 сотрудников — сначала переведите их в другой отдел/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it.each([
    [1, '1 сотрудник'],
    [2, '2 сотрудника'],
    [5, '5 сотрудников'],
    [11, '11 сотрудников'],
    [21, '21 сотрудник'],
    [12, '12 сотрудников']
  ])('declines the count %i', (employeeCount, text) => {
    setup({ ...departmentFixture, employeeCount })
    expect(screen.getByText(new RegExp(`Сейчас в отделе ${text} —`))).toBeTruthy()
  })

  it('renders nothing while closed', () => {
    setup(emptyDepartment, false)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
