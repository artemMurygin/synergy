import { useEffect, useId, useRef, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { controlClass, FormField } from '@/components/ui/form-field'
import { SELECT_CHEVRON_STYLE, selectArrowClass } from '@/components/ui/select'
import type { Department } from '@/features/departments'
import type { Role } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import type { EmployeeFormFieldErrors } from '../model/employee-form-errors'
import type { CreateEmployeeInput, Employee, UpdateEmployeeInput } from '../model/employees.schema'
import { ROLE_LABEL, ROLE_ORDER } from './role-labels'

export type EmployeeFormErrors = EmployeeFormFieldErrors

export const LOGIN_MAX = 64
export const NAME_PART_MAX = 200
export const EMAIL_MAX = 254
export const POSITION_MAX = 200
export const SCRM_ID_MAX = 64
export const EMAIL_FORMAT_MESSAGE = 'Проверьте адрес: например, ivanov@synergy.ru'

interface CommonProps {
  departments: Department[]
  /** Server answers shown at the fields (409 login / email, 404 department) or as one general alert */
  fieldErrors?: EmployeeFormErrors
  pending?: boolean
}

export type EmployeeFormProps =
  | (CommonProps & { mode: 'create'; onSubmit: (input: CreateEmployeeInput) => void; onCancel: () => void })
  | (CommonProps & { mode: 'edit'; initial: Employee; onSubmit: (input: UpdateEmployeeInput) => void; saved?: boolean })

interface Values {
  login: string
  lastName: string
  firstName: string
  middleName: string
  departmentId: string
  position: string
  email: string
  scrmEmployeeId: string
  roles: Role[]
}

type FieldKey = Exclude<keyof Values, 'roles'>
type LocalErrors = Partial<Record<FieldKey, string>>

const EMPTY: Values = { login: '', lastName: '', firstName: '', middleName: '', departmentId: '', position: '', email: '', scrmEmployeeId: '', roles: [] }

const FOCUS_ORDER: FieldKey[] = ['login', 'lastName', 'firstName', 'middleName', 'departmentId', 'position', 'email', 'scrmEmployeeId']

function valuesOf(employee: Employee): Values {
  return {
    login: employee.login,
    lastName: employee.lastName ?? '',
    firstName: employee.firstName ?? '',
    middleName: employee.middleName ?? '',
    departmentId: employee.department?.id ?? '',
    position: employee.position ?? '',
    email: employee.email ?? '',
    scrmEmployeeId: employee.scrmEmployeeId ?? '',
    roles: []
  }
}

function validate(values: Values, mode: 'create' | 'edit'): LocalErrors {
  const errors: LocalErrors = {}
  if (mode === 'create') {
    const login = values.login.trim()
    if (login === '') errors.login = 'Укажите логин'
    else if (login.length > LOGIN_MAX) errors.login = `Не длиннее ${String(LOGIN_MAX)} символов`
  }
  const tooLong = `Не длиннее ${String(NAME_PART_MAX)} символов`
  const last = values.lastName.trim()
  if (last === '') errors.lastName = 'Укажите фамилию'
  else if (last.length > NAME_PART_MAX) errors.lastName = tooLong
  const first = values.firstName.trim()
  if (first === '') errors.firstName = 'Укажите имя'
  else if (first.length > NAME_PART_MAX) errors.firstName = tooLong
  if (values.middleName.trim().length > NAME_PART_MAX) errors.middleName = tooLong
  if (values.position.trim().length > POSITION_MAX) errors.position = tooLong
  if (values.scrmEmployeeId.trim().length > SCRM_ID_MAX) errors.scrmEmployeeId = `Не длиннее ${String(SCRM_ID_MAX)} символов`
  const email = values.email.trim()
  if (email !== '') {
    if (email.length > EMAIL_MAX) errors.email = `Не длиннее ${String(EMAIL_MAX)} символов`
    else if (!email.includes('@') || /\s/.test(email)) errors.email = EMAIL_FORMAT_MESSAGE
  }
  return errors
}

function normalized(values: Values) {
  return JSON.stringify([
    values.lastName.trim(),
    values.firstName.trim(),
    values.middleName.trim(),
    values.departmentId,
    values.position.trim(),
    values.email.trim(),
    values.scrmEmployeeId.trim()
  ])
}

function SectionTitle({ children }: { children: string }) {
  return <legend className="mb-3 font-sans text-[15px] font-semibold text-ink">{children}</legend>
}

/* EmployeeForm: one form for creation (groups, roles, "Создать сотрудника") and the profile card (flat, no roles, "Сохранить").
   Checks are its own (noValidate), the first field with an error gets the focus; what is typed survives a server error. */
export function EmployeeForm(props: EmployeeFormProps) {
  const { mode, departments, fieldErrors, pending } = props
  const uid = useId()
  const base = mode === 'edit' ? valuesOf(props.initial) : EMPTY
  const baseKey = JSON.stringify(base)
  const [seenKey, setSeenKey] = useState(baseKey)
  const [values, setValues] = useState<Values>(base)
  const [local, setLocal] = useState<LocalErrors>({})
  const [serverSeen, setServerSeen] = useState<EmployeeFormErrors | undefined>(fieldErrors)
  const [deptReset, setDeptReset] = useState(false)
  const [serverHidden, setServerHidden] = useState<Partial<Record<FieldKey, true>>>({})
  const refs = useRef<Partial<Record<FieldKey, HTMLInputElement | HTMLSelectElement | null>>>({})

  // the card came back from the server with other data (saved, reloaded): show it; the same data keeps unsaved typing
  if (seenKey !== baseKey) {
    setSeenKey(baseKey)
    setValues(base)
    setLocal({})
  }
  // a new server answer: show it again even where the user had already started to correct the field
  if (serverSeen !== fieldErrors) {
    setServerSeen(fieldErrors)
    setServerHidden({})
    if (fieldErrors?.departmentId) {
      setValues((current) => ({ ...current, departmentId: '' }))
      setDeptReset(true)
    }
  }

  useEffect(() => {
    if (!fieldErrors) return
    const target: FieldKey | null = fieldErrors.login ? 'login' : fieldErrors.email ? 'email' : null
    if (target) refs.current[target]?.focus()
  }, [fieldErrors])

  const serverError: LocalErrors = {
    login: fieldErrors?.login,
    email: fieldErrors?.email,
    departmentId: fieldErrors?.departmentId
  }
  const errorOf = (key: FieldKey): string | undefined => local[key] ?? (serverHidden[key] ? undefined : serverError[key])

  const dirty = mode === 'edit' && normalized(values) !== normalized(base)

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    if (key === 'departmentId') setDeptReset(false)
    if (key !== 'roles') {
      const field = key as FieldKey
      setLocal((current) => ({ ...current, [field]: undefined }))
      setServerHidden((current) => ({ ...current, [field]: true }))
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    if (mode === 'edit' && !dirty) return
    const problems = validate(values, mode)
    setLocal(problems)
    const first = FOCUS_ORDER.find((key) => problems[key])
    if (first) {
      refs.current[first]?.focus()
      return
    }
    const trim = (value: string) => value.trim()
    if (props.mode === 'create') {
      const input: CreateEmployeeInput = {
        login: trim(values.login),
        lastName: trim(values.lastName),
        firstName: trim(values.firstName),
        roles: ROLE_ORDER.filter((role) => values.roles.includes(role))
      }
      if (trim(values.middleName)) input.middleName = trim(values.middleName)
      if (values.departmentId) input.departmentId = values.departmentId
      if (trim(values.position)) input.position = trim(values.position)
      if (trim(values.email)) input.email = trim(values.email)
      if (trim(values.scrmEmployeeId)) input.scrmEmployeeId = trim(values.scrmEmployeeId)
      props.onSubmit(input)
    } else {
      props.onSubmit({
        lastName: trim(values.lastName),
        firstName: trim(values.firstName),
        middleName: trim(values.middleName) || null,
        departmentId: values.departmentId || null,
        position: trim(values.position) || null,
        email: trim(values.email) || null,
        scrmEmployeeId: trim(values.scrmEmployeeId) || null
      })
    }
  }

  const options = [...departments].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  if (mode === 'edit' && props.initial.department && !options.some((d) => d.id === props.initial.department?.id)) {
    options.push({ id: props.initial.department.id, name: props.initial.department.name, head: null, employeeCount: 0 })
  }

  function text(key: FieldKey, label: string, opts: { maxLength?: number; hint?: string; required?: boolean; type?: string; readOnly?: boolean; autoComplete?: string } = {}) {
    const id = `${uid}-${key}`
    const error = errorOf(key)
    const hint = opts.hint
    const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
    return (
      <FormField label={label} hint={hint} hintClassName="text-ink-60" controlId={id} hintId={`${id}-hint`} error={error} errorId={`${id}-error`} className="min-w-0 flex-1">
        <input
          ref={(element) => {
            refs.current[key] = element
          }}
          id={id}
          type={opts.type ?? 'text'}
          value={values[key]}
          readOnly={opts.readOnly}
          maxLength={opts.maxLength}
          aria-readonly={opts.readOnly ? true : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete={opts.autoComplete}
          autoCapitalize={key === 'login' ? 'none' : undefined}
          onChange={(event) => set(key, event.target.value)}
          className={cn(controlClass, 'h-12', opts.readOnly && 'bg-surface-sunken')}
        />
      </FormField>
    )
  }

  function department() {
    const id = `${uid}-departmentId`
    const error = errorOf('departmentId')
    const placeholder = deptReset && values.departmentId === ''
    return (
      <FormField label="Отдел" controlId={id} errorId={`${id}-error`} error={error} className="min-w-0 flex-1">
        <select
          ref={(element) => {
            refs.current.departmentId = element
          }}
          id={id}
          value={values.departmentId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => set('departmentId', event.target.value)}
          style={SELECT_CHEVRON_STYLE}
          className={cn(controlClass, 'h-12', selectArrowClass, placeholder && 'text-ink-40')}
        >
          <option value="">{placeholder ? 'Выберите отдел' : 'Без отдела'}</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </FormField>
    )
  }

  const row = 'flex flex-col gap-4 sm:flex-row'
  const required = 'обязательно'
  const nameRow = (
    <div className={row}>
      {text('lastName', 'Фамилия', { maxLength: NAME_PART_MAX, hint: required })}
      {text('firstName', 'Имя', { maxLength: NAME_PART_MAX, hint: required })}
      {text('middleName', 'Отчество', { maxLength: NAME_PART_MAX })}
    </div>
  )
  const workRow = (
    <div className={row}>
      {department()}
      {text('position', 'Должность', { maxLength: POSITION_MAX })}
    </div>
  )
  const contactRow = (
    <div className={row}>
      {text('email', 'Email', { maxLength: EMAIL_MAX, hint: 'необязательно, должен быть уникальным', type: 'email' })}
      {text('scrmEmployeeId', 'ID в SCRM', { maxLength: SCRM_ID_MAX, hint: 'для справки' })}
    </div>
  )

  const general = fieldErrors?.general

  if (props.mode === 'create') {
    const toggle = (role: Role, on: boolean) => set('roles', on ? [...values.roles, role] : values.roles.filter((item) => item !== role))
    return (
      <form noValidate onSubmit={submit} className="flex w-full max-w-[720px] flex-col gap-6 rounded-lg border border-border bg-surface p-5 sm:p-7">
        <fieldset className="flex min-w-0 flex-col">
          <SectionTitle>Учётная запись</SectionTitle>
          {text('login', 'Логин', { maxLength: LOGIN_MAX, hint: 'обязательно · латиница, до 64 символов, без пробелов по краям', autoComplete: 'off' })}
        </fieldset>
        <fieldset className="flex min-w-0 flex-col">
          <SectionTitle>ФИО</SectionTitle>
          {nameRow}
        </fieldset>
        <fieldset className="flex min-w-0 flex-col">
          <SectionTitle>Работа</SectionTitle>
          {workRow}
        </fieldset>
        <fieldset className="flex min-w-0 flex-col">
          <SectionTitle>Контакты и справка</SectionTitle>
          {contactRow}
        </fieldset>
        <fieldset className="flex min-w-0 flex-col">
          <SectionTitle>Роли</SectionTitle>
          {ROLE_ORDER.map((role) => (
            <Checkbox
              key={role}
              label={ROLE_LABEL[role]}
              description={ROLE_HINT[role]}
              checked={values.roles.includes(role)}
              onCheckedChange={(on) => toggle(role, on)}
            />
          ))}
          <p className="mt-1 text-xs text-ink-60">Без ролей сотрудник видит только «Новую идею» и «Мои заявки»</p>
        </fieldset>
        {general ? <Alert tone="error">{general}</Alert> : null}
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button variant="outline" className="w-full sm:w-auto" onClick={props.onCancel}>
            Отмена
          </Button>
          <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
            {pending ? 'Создаём…' : 'Создать сотрудника'}
          </Button>
        </div>
      </form>
    )
  }

  const unfilled = !props.initial.lastName || !props.initial.firstName
  return (
    <form noValidate onSubmit={submit} className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-5 sm:p-7">
      <h2 className="font-display text-xl font-bold text-ink">Профиль</h2>
      {unfilled ? <Alert tone="info">Профиль не заполнен. Укажите фамилию и имя</Alert> : null}
      {text('login', 'Логин', { maxLength: LOGIN_MAX, hint: 'не меняется', readOnly: true })}
      {nameRow}
      {workRow}
      {contactRow}
      {props.saved ? <Alert tone="success">Изменения сохранены</Alert> : null}
      {general ? <Alert tone="error">{general}</Alert> : null}
      <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
        {dirty ? (
          <Button
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={() => {
              setValues(base)
              setLocal({})
              setServerHidden({ login: true, email: true, departmentId: true })
            }}
          >
            Отменить изменения
          </Button>
        ) : null}
        <Button type="submit" className="w-full sm:w-auto" disabled={pending || !dirty}>
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </div>
    </form>
  )
}

export const ROLE_HINT: Record<Role, string> = { developer: 'очередь заявок и навыки', admin: 'сотрудники и отделы' }
