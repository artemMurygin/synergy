import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { EmployeeForm, TemporaryPasswordDialog, employeeFormErrors, useCreateEmployee, type CreatedEmployee } from '@/features/employees'
import { BackIcon, PageHeading } from './admin-ui'
import { useDepartments } from './use-departments'

export function EmployeeCreatePage() {
  const navigate = useNavigate()
  const departments = useDepartments()
  const create = useCreateEmployee()
  // the one-time answer lives only here, until the administrator closes the window
  const [created, setCreated] = useState<CreatedEmployee | null>(null)

  // a stable object per error: the form compares it by reference to tell a new server answer from a re-render
  const fieldErrors = useMemo(() => (create.isError ? employeeFormErrors(create.error, 'create') : undefined), [create.isError, create.error])

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link to="/admin/employees" className="flex min-h-11 items-center gap-1.5 self-start text-[13px] leading-4 font-semibold text-ink-60 hover:text-ink">
          <BackIcon />
          Сотрудники
        </Link>
        <PageHeading title="Новый сотрудник" caption="После создания портал покажет временный пароль. При первом входе сотрудник сменит его" />
      </div>
      <EmployeeForm
        mode="create"
        departments={departments.data ?? []}
        fieldErrors={fieldErrors}
        pending={create.isPending}
        onCancel={() => void navigate('/admin/employees')}
        onSubmit={(input) => create.mutate(input, { onSuccess: setCreated })}
      />
      {created ? (
        <TemporaryPasswordDialog
          login={created.employee.login}
          password={created.temporaryPassword}
          onClose={() => {
            const id = created.employee.id
            setCreated(null)
            create.reset()
            void navigate(`/admin/employees/${encodeURIComponent(id)}`, { state: { created: true } })
          }}
        />
      ) : null}
    </section>
  )
}
