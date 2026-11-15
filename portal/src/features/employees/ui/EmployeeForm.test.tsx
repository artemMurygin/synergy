import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Department } from '@/features/departments'
import { bareEmployeeFixture, employeeFixture, noNameEmployeeFixture } from '../model/employees.fixtures'
import type { CreateEmployeeInput, Employee, UpdateEmployeeInput } from '../model/employees.schema'
import { EmployeeForm, type EmployeeFormErrors } from './EmployeeForm'

afterEach(cleanup)

const departments: Department[] = [
  { id: 'd-sales', name: 'Продажи', head: null, employeeCount: 3 },
  { id: 'd1', name: 'Бухгалтерия', head: null, employeeCount: 2 }
]

function setupCreate(extra: { fieldErrors?: EmployeeFormErrors; pending?: boolean } = {}) {
  const onSubmit = vi.fn<(input: CreateEmployeeInput) => void>()
  const onCancel = vi.fn()
  const element = (more: { fieldErrors?: EmployeeFormErrors; pending?: boolean } = {}) => (
    <EmployeeForm mode="create" departments={departments} onSubmit={onSubmit} onCancel={onCancel} {...extra} {...more} />
  )
  const view = render(element())
  return { onSubmit, onCancel, rerender: (more: { fieldErrors?: EmployeeFormErrors; pending?: boolean }) => view.rerender(element(more)) }
}

function setupEdit(initial: Employee = employeeFixture, extra: { fieldErrors?: EmployeeFormErrors; saved?: boolean; pending?: boolean } = {}) {
  const onSubmit = vi.fn<(input: UpdateEmployeeInput) => void>()
  const element = (nextInitial = initial, more: typeof extra = {}) => (
    <EmployeeForm mode="edit" initial={nextInitial} departments={departments} onSubmit={onSubmit} {...extra} {...more} />
  )
  const view = render(element())
  return { onSubmit, rerender: (nextInitial = initial, more: typeof extra = {}) => view.rerender(element(nextInitial, more)) }
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement

async function fillRequired() {
  await userEvent.type(field('Логин'), 'ivanov')
  await userEvent.type(field('Фамилия'), 'Иванов')
  await userEvent.type(field('Имя'), 'Иван')
}

describe('EmployeeForm · create', () => {
  it('has the groups and fields of the design with required marks in the hint', () => {
    setupCreate()
    for (const legend of ['Учётная запись', 'ФИО', 'Работа', 'Контакты и справка', 'Роли']) {
      expect(screen.getByRole('group', { name: legend })).toBeTruthy()
    }
    for (const label of ['Логин', 'Фамилия', 'Имя', 'Отчество', 'Отдел', 'Должность', 'Email', 'ID в SCRM']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    expect(screen.getByText('обязательно · латиница, до 64 символов, без пробелов по краям')).toBeTruthy()
    expect(screen.getAllByText('обязательно')).toHaveLength(2)
    expect(screen.getByText('необязательно, должен быть уникальным')).toBeTruthy()
    expect(screen.getByText('для справки')).toBeTruthy()
  })

  it('disables autocomplete and autocapitalize on the login', () => {
    setupCreate()
    expect(field('Логин').getAttribute('autocomplete')).toBe('off')
    expect(field('Логин').getAttribute('autocapitalize')).toBe('none')
    expect(field('Логин').readOnly).toBe(false)
  })

  it('has type email on the email field', () => {
    setupCreate()
    expect(field('Email').type).toBe('email')
  })

  it('lists "Без отдела" and the departments alphabetically', () => {
    setupCreate()
    const labels = Array.from(screen.getByLabelText('Отдел').querySelectorAll('option')).map((o) => o.textContent)
    expect(labels).toEqual(['Без отдела', 'Бухгалтерия', 'Продажи'])
  })

  it('has both roles unchecked and the explanation under the group', () => {
    setupCreate()
    expect((screen.getByRole('checkbox', { name: 'Разработчик' }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('checkbox', { name: 'Администратор' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText('Без ролей сотрудник видит только «Новую идею» и «Мои заявки»')).toBeTruthy()
  })

  it('has the buttons "Отмена" and "Создать сотрудника"', async () => {
    const { onCancel } = setupCreate()
    expect(screen.getByRole('button', { name: 'Создать сотрудника' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('blocks an empty form, shows the three required errors and focuses the login', async () => {
    const { onSubmit } = setupCreate()
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Укажите логин')).toBeTruthy()
    expect(screen.getByText('Укажите фамилию')).toBeTruthy()
    expect(screen.getByText('Укажите имя')).toBeTruthy()
    expect(field('Логин').getAttribute('aria-invalid')).toBe('true')
    expect(field('Логин').getAttribute('aria-describedby')).toContain(`${field('Логин').id}-error`)
    expect(document.activeElement).toBe(field('Логин'))
  })

  it('focuses the first field with an error, not the first field', async () => {
    const { onSubmit } = setupCreate()
    await userEvent.type(field('Логин'), 'ivanov')
    await userEvent.type(field('Имя'), 'Иван')
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Укажите фамилию')).toBeTruthy()
    expect(document.activeElement).toBe(field('Фамилия'))
  })

  it('treats spaces only as empty', async () => {
    const { onSubmit } = setupCreate()
    await userEvent.type(field('Фамилия'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Укажите фамилию')).toBeTruthy()
  })

  it('blocks a login longer than 64 characters but accepts exactly 64', async () => {
    const { onSubmit } = setupCreate()
    await userEvent.type(field('Фамилия'), 'Иванов')
    await userEvent.type(field('Имя'), 'Иван')
    fireEvent.change(field('Логин'), { target: { value: 'a'.repeat(65) } })
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Не длиннее 64 символов')).toBeTruthy()
    fireEvent.change(field('Логин'), { target: { value: 'a'.repeat(64) } })
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('blocks a name part longer than 200 characters', async () => {
    const { onSubmit } = setupCreate()
    await userEvent.type(field('Логин'), 'ivanov')
    await userEvent.type(field('Имя'), 'Иван')
    fireEvent.change(field('Фамилия'), { target: { value: 'я'.repeat(201) } })
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Не длиннее 200 символов')).toBeTruthy()
  })

  it.each(['ivanov', 'iva nov@synergy.ru', 'ivanov@syn ergy.ru'])('rejects the email "%s" before sending and focuses it', async (email) => {
    const { onSubmit } = setupCreate()
    await fillRequired()
    await userEvent.type(field('Email'), email)
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Проверьте адрес: например, ivanov@synergy.ru')).toBeTruthy()
    expect(field('Email').getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field('Email'))
  })

  it('blocks an email longer than 254 characters', async () => {
    const { onSubmit } = setupCreate()
    await fillRequired()
    fireEvent.change(field('Email'), { target: { value: `${'a'.repeat(250)}@b.ru` } })
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Не длиннее 254 символов')).toBeTruthy()
  })

  it('draws the chevron of the department select as a background image', () => {
    setupCreate()
    expect((screen.getByLabelText('Отдел') as HTMLSelectElement).style.backgroundImage).toContain('svg')
  })

  it('limits the length of every field in the markup as the API does', () => {
    setupCreate()
    const limits: [string, number][] = [['Логин', 64], ['Фамилия', 200], ['Имя', 200], ['Отчество', 200], ['Должность', 200], ['Email', 254], ['ID в SCRM', 64]]
    for (const [label, max] of limits) expect(field(label).maxLength, label).toBe(max)
  })

  it.each([
    ['Должность', 201, 'Не длиннее 200 символов'],
    ['ID в SCRM', 65, 'Не длиннее 64 символов']
  ])('blocks %s longer than the limit and focuses it', async (label, length, message) => {
    const { onSubmit } = setupCreate()
    await fillRequired()
    fireEvent.change(field(label), { target: { value: 'я'.repeat(length) } })
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(message)).toBeTruthy()
    expect(document.activeElement).toBe(field(label))
  })

  it('accepts the position of exactly 200 and the SCRM id of exactly 64 characters', async () => {
    const { onSubmit } = setupCreate()
    await fillRequired()
    fireEvent.change(field('Должность'), { target: { value: 'я'.repeat(200) } })
    fireEvent.change(field('ID в SCRM'), { target: { value: '9'.repeat(64) } })
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('submits only the required fields, trimmed, with empty roles', async () => {
    const { onSubmit } = setupCreate()
    await userEvent.type(field('Логин'), '  ivanov ')
    await userEvent.type(field('Фамилия'), ' Иванов ')
    await userEvent.type(field('Имя'), 'Иван')
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(onSubmit).toHaveBeenCalledWith({ login: 'ivanov', lastName: 'Иванов', firstName: 'Иван', roles: [] })
  })

  it('submits every filled field and the chosen roles', async () => {
    const { onSubmit } = setupCreate()
    await fillRequired()
    await userEvent.type(field('Отчество'), 'Петрович')
    await userEvent.selectOptions(screen.getByLabelText('Отдел'), 'Бухгалтерия')
    await userEvent.type(field('Должность'), 'Бухгалтер')
    await userEvent.type(field('Email'), 'ivanov@synergy.ru')
    await userEvent.type(field('ID в SCRM'), 'scrm-7')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Администратор' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Разработчик' }))
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(onSubmit).toHaveBeenCalledWith({
      login: 'ivanov',
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: 'Петрович',
      departmentId: 'd1',
      position: 'Бухгалтер',
      email: 'ivanov@synergy.ru',
      scrmEmployeeId: 'scrm-7',
      roles: ['developer', 'admin']
    })
  })

  it('shows the 409 on the login at the field, focuses it and keeps the entered values', async () => {
    const { rerender } = setupCreate()
    await fillRequired()
    await userEvent.type(field('Email'), 'ivanov@synergy.ru')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Администратор' }))
    rerender({ fieldErrors: { login: 'Этот логин уже занят' } })
    expect(screen.getByText('Этот логин уже занят')).toBeTruthy()
    expect(field('Логин').getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field('Логин'))
    expect(field('Логин').value).toBe('ivanov')
    expect(field('Фамилия').value).toBe('Иванов')
    expect(field('Email').value).toBe('ivanov@synergy.ru')
    expect((screen.getByRole('checkbox', { name: 'Администратор' }) as HTMLInputElement).checked).toBe(true)
  })

  it('shows the 409 on the email at the field and focuses it', async () => {
    const { rerender } = setupCreate()
    await fillRequired()
    await userEvent.type(field('Email'), 'ivanov@synergy.ru')
    rerender({ fieldErrors: { email: 'Этот email уже у другого сотрудника' } })
    expect(screen.getByText('Этот email уже у другого сотрудника')).toBeTruthy()
    expect(field('Email').getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field('Email'))
    expect(field('Логин').value).toBe('ivanov')
  })

  it('shows the 404 on the department at the field', () => {
    setupCreate({ fieldErrors: { departmentId: 'Отдел удалён. Выберите другой' } })
    expect(screen.getByText('Отдел удалён. Выберите другой')).toBeTruthy()
    expect(screen.getByLabelText('Отдел').getAttribute('aria-invalid')).toBe('true')
  })

  it('shows a general error as an alert above the buttons', () => {
    setupCreate({ fieldErrors: { general: 'Не удалось создать сотрудника. Проверьте соединение и попробуйте ещё раз' } })
    expect(within(screen.getByRole('alert')).getByText(/Не удалось создать сотрудника/)).toBeTruthy()
  })

  it('disables the submit while pending and says "Создаём…"', () => {
    setupCreate({ pending: true })
    expect((screen.getByRole('button', { name: 'Создаём…' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Создать сотрудника' })).toBeNull()
  })

  it('does not submit twice while pending', async () => {
    const { onSubmit } = setupCreate({ pending: true })
    await userEvent.click(screen.getByRole('button', { name: 'Создаём…' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('EmployeeForm · edit', () => {
  it('shows the login read-only, not editable, with the hint "не меняется"', async () => {
    setupEdit()
    const login = field('Логин')
    expect(login.value).toBe('ivanov')
    expect(login.readOnly).toBe(true)
    expect(login.getAttribute('aria-readonly')).toBe('true')
    expect(screen.getByText('не меняется')).toBeTruthy()
    await userEvent.type(login, 'zzz')
    expect(login.value).toBe('ivanov')
  })

  it('fills the fields with the current values', () => {
    setupEdit()
    expect(field('Фамилия').value).toBe('Иванов')
    expect(field('Имя').value).toBe('Иван')
    expect(field('Отчество').value).toBe('Петрович')
    expect((screen.getByLabelText('Отдел') as HTMLSelectElement).value).toBe('d1')
    expect(field('Должность').value).toBe('Бухгалтер')
    expect(field('Email').value).toBe('ivanov@example.com')
    expect(field('ID в SCRM').value).toBe('scrm-1')
  })

  it('has no role checkboxes (roles are a separate card)', () => {
    setupEdit()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('keeps "Сохранить" disabled and hides "Отменить изменения" until something changes', async () => {
    setupEdit()
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Отменить изменения' })).toBeNull()
    await userEvent.type(field('Должность'), '!')
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Отменить изменения' })).toBeTruthy()
  })

  it('"Отменить изменения" restores the values', async () => {
    setupEdit()
    await userEvent.type(field('Должность'), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    expect(field('Должность').value).toBe('Бухгалтер')
    expect(screen.queryByRole('button', { name: 'Отменить изменения' })).toBeNull()
  })

  it('submits the profile and clears an emptied optional field with null', async () => {
    const { onSubmit } = setupEdit()
    await userEvent.clear(field('Должность'))
    await userEvent.clear(field('Отчество'))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSubmit).toHaveBeenCalledWith({
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: null,
      departmentId: 'd1',
      position: null,
      email: 'ivanov@example.com',
      scrmEmployeeId: 'scrm-1'
    })
  })

  it('sends null for the department when "Без отдела" is chosen', async () => {
    const { onSubmit } = setupEdit()
    await userEvent.selectOptions(screen.getByLabelText('Отдел'), 'Без отдела')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ departmentId: null }))
  })

  it('checks the fields before sending, as at creation', async () => {
    const { onSubmit } = setupEdit()
    await userEvent.clear(field('Фамилия'))
    await userEvent.clear(field('Email'))
    await userEvent.type(field('Email'), 'oops')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Укажите фамилию')).toBeTruthy()
    expect(screen.getByText('Проверьте адрес: например, ivanov@synergy.ru')).toBeTruthy()
    expect(document.activeElement).toBe(field('Фамилия'))
  })

  it('shows the 409 on the email at the field and keeps unsaved changes', async () => {
    const { rerender } = setupEdit()
    await userEvent.clear(field('Email'))
    await userEvent.type(field('Email'), 'taken@synergy.ru')
    await userEvent.type(field('Должность'), ' старший')
    rerender(employeeFixture, { fieldErrors: { email: 'Этот email уже у другого сотрудника' } })
    expect(screen.getByText('Этот email уже у другого сотрудника')).toBeTruthy()
    expect(field('Email').value).toBe('taken@synergy.ru')
    expect(field('Должность').value).toBe('Бухгалтер старший')
  })

  it('keeps unsaved changes when the card is reloaded with the same data after an error', async () => {
    const { rerender } = setupEdit()
    await userEvent.type(field('Должность'), ' старший')
    rerender({ ...employeeFixture }, { fieldErrors: { general: 'Не удалось сохранить изменения' } })
    expect(field('Должность').value).toBe('Бухгалтер старший')
  })

  it('shows the actual data from the server after a successful save', async () => {
    const { rerender } = setupEdit()
    await userEvent.type(field('Должность'), ' старший')
    rerender({ ...employeeFixture, position: 'Старший бухгалтер' }, { saved: true })
    expect(field('Должность').value).toBe('Старший бухгалтер')
    expect(screen.queryByRole('button', { name: 'Отменить изменения' })).toBeNull()
  })

  it('shows "Изменения сохранены" as a status', () => {
    setupEdit(employeeFixture, { saved: true })
    expect(within(screen.getByRole('status')).getByText('Изменения сохранены')).toBeTruthy()
  })

  it('shows a general error as an alert', () => {
    setupEdit(employeeFixture, { fieldErrors: { general: 'Не удалось сохранить изменения' } })
    expect(within(screen.getByRole('alert')).getByText('Не удалось сохранить изменения')).toBeTruthy()
  })

  it('shows "Сохраняем…" and disables the button while pending', async () => {
    setupEdit(employeeFixture, { pending: true })
    expect((screen.getByRole('button', { name: 'Сохраняем…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('for a person without a name shows empty name fields and the hint "Профиль не заполнен"', () => {
    setupEdit(noNameEmployeeFixture)
    expect(field('Фамилия').value).toBe('')
    expect(field('Имя').value).toBe('')
    expect(field('Логин').value).toBe('petrov')
    expect(within(screen.getByRole('status')).getByText('Профиль не заполнен. Укажите фамилию и имя')).toBeTruthy()
  })

  it('does not show the hint for a filled profile', () => {
    setupEdit(bareEmployeeFixture)
    expect(screen.queryByText('Профиль не заполнен. Укажите фамилию и имя')).toBeNull()
  })

  it('keeps a department that is not in the loaded list selectable as the current one', () => {
    setupEdit({ ...employeeFixture, department: { id: 'gone', name: 'Старый отдел' } })
    expect((screen.getByLabelText('Отдел') as HTMLSelectElement).value).toBe('gone')
  })
})

describe('EmployeeForm · 404 DEPARTMENT_NOT_FOUND', () => {
  it('resets the department to the placeholder and does not resend the deleted id', async () => {
    const { onSubmit, rerender } = setupCreate()
    await fillRequired()
    await userEvent.selectOptions(field('Отдел') as unknown as HTMLSelectElement, 'd1')
    rerender({ fieldErrors: { departmentId: 'Отдел удалён. Выберите другой' } })
    const select = screen.getByLabelText('Отдел') as unknown as HTMLSelectElement
    expect(select.value).toBe('')
    expect(select.options[select.selectedIndex]?.textContent).toBe('Выберите отдел')
    expect(select.className).toContain('text-ink-40')
    expect(screen.getByText('Отдел удалён. Выберите другой')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Создать сотрудника' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('departmentId')
  })
})
