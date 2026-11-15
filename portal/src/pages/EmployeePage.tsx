import { useMemo } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useSession } from '@/features/auth'
import { PersonAvatar } from '@/components/ui/person-avatar'
import {
  DismissAction,
  EmployeeForm,
  RolesEditor,
  employeeErrorCode,
  employeeFormErrors,
  useDismissEmployee,
  useReplaceRoles,
  useRestoreEmployee,
  useUpdateEmployee,
  type Employee
} from '@/features/employees'
import { BackIcon, ErrorBlock } from './admin-ui'
import { NotFoundView } from './NotFoundView'
import { useDepartments } from './use-departments'
import { useEmployee } from './use-employee'

function Skeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <p className="text-sm text-ink-60">Загружаем карточку…</p>
      <div aria-hidden="true" className="flex items-center gap-4">
        <div className="size-14 shrink-0 animate-pulse rounded-pill bg-surface-alt" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-6 w-2/3 animate-pulse rounded-lg bg-surface-alt" />
          <div className="h-4 w-1/2 animate-pulse rounded-lg bg-surface-alt" />
        </div>
      </div>
      {['h-64', 'h-36', 'h-24'].map((h) => (
        <div key={h} aria-hidden="true" className={`animate-pulse rounded-lg bg-surface-alt ${h}`} />
      ))}
    </div>
  )
}

function Card({ employee, created }: { employee: Employee; created: boolean }) {
  const { profile } = useSession()
  const departments = useDepartments()
  const update = useUpdateEmployee(employee.id)
  const roles = useReplaceRoles(employee.id)
  const dismiss = useDismissEmployee(employee.id)
  const restore = useRestoreEmployee(employee.id)
  // a stable object per error: the form compares it by reference to tell a new server answer from a re-render
  const fieldErrors = useMemo(() => (update.isError ? employeeFormErrors(update.error, 'edit') : undefined), [update.isError, update.error])
  const meta = [employee.login, employee.position, employee.department?.name].filter(Boolean).join(' · ')
  const lastAdmin = (error: unknown) => employeeErrorCode(error) === 'LAST_ADMIN'
  const failure = (error: { message: string } | null, fallback: string) => (error && !lastAdmin(error) ? fallback : undefined)

  return (
    <article className="flex flex-col gap-6">
      {created ? <Alert tone="success" role="status">Сотрудник создан</Alert> : null}
      <header className="flex items-start gap-4">
        <PersonAvatar fullName={employee.fullName} className={`size-14 text-lg ${employee.isActive ? '' : 'opacity-60'}`} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 break-words font-display text-[26px] font-bold leading-[1.28] tracking-[-0.4px] text-ink min-[768px]:text-[32px] min-[768px]:tracking-[-0.6px]">
              {employee.fullName}
            </h1>
            <Badge tone={employee.isActive ? 'success' : 'neutral'}>{employee.isActive ? 'Активен' : 'Уволен'}</Badge>
          </div>
          <p className="break-words text-sm text-ink-60">{meta}</p>
        </div>
      </header>
      <div className="flex flex-col gap-6 min-[1024px]:grid min-[1024px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] min-[1024px]:items-start">
        <EmployeeForm
          mode="edit"
          initial={employee}
          departments={departments.data ?? []}
          fieldErrors={fieldErrors}
          pending={update.isPending}
          saved={update.isSuccess}
          onSubmit={(input) => update.mutate(input)}
        />
        <div className="flex flex-col gap-4">
          <RolesEditor
            roles={employee.roles}
            pending={roles.isPending}
            saved={roles.isSuccess}
            lastAdminError={lastAdmin(roles.error)}
            error={failure(roles.error, 'Не удалось сохранить роли')}
            onSave={(next) => roles.mutate(next)}
          />
          <DismissAction
            employee={employee}
            isSelf={profile?.id === employee.id}
            success={dismiss.isSuccess ? 'dismissed' : restore.isSuccess ? 'restored' : undefined}
            lastAdminError={lastAdmin(dismiss.error)}
            error={failure(dismiss.error, 'Не удалось уволить сотрудника') ?? failure(restore.error, 'Не удалось вернуть сотрудника')}
            onDismiss={() => {
              restore.reset()
              return dismiss.mutateAsync()
            }}
            onRestore={() => {
              dismiss.reset()
              return restore.mutateAsync()
            }}
          />
        </div>
      </div>
    </article>
  )
}

export function EmployeePage() {
  const { id = '' } = useParams()
  const query = useEmployee(id)
  const location = useLocation()

  return (
    <section className="flex flex-col gap-4">
      {query.notFound ? null : (
        <Link to="/admin/employees" className="flex min-h-11 items-center gap-1.5 self-start text-[13px] leading-4 font-semibold text-ink-60 hover:text-ink">
          <BackIcon />
          Сотрудники
        </Link>
      )}
      {query.notFound ? (
        <NotFoundView
          title="Сотрудник не найден"
          text="Ссылка могла устареть, или сотрудника нет в портале. Проверьте адрес или вернитесь к списку."
          back={{ to: '/admin/employees', label: 'К списку сотрудников' }}
        />
      ) : query.isPending ? (
        <Skeleton />
      ) : query.isError ? (
        <ErrorBlock title="Не удалось загрузить карточку" message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <Card employee={query.data} created={(location.state as { created?: boolean } | null)?.created === true} />
      )}
    </section>
  )
}
