import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { EmployeeFilters, EmployeeTable, type EmployeeFiltersValue, type EmployeeStatusFilter } from '@/features/employees'
import { EmptyBlock, ErrorBlock, LoadingBlock, PageHeading, PlusIcon } from './admin-ui'
import { useDepartments } from './use-departments'
import { useEmployees } from './use-employees'

const STATUSES: readonly EmployeeStatusFilter[] = ['all', 'active', 'dismissed']

const PeopleIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

/* The filters and the page live in the address (?search=&department=&status=&page=, page from 1), so "Back" and a reload keep them. */
function readParams(params: URLSearchParams) {
  const status = params.get('status')
  const page = Number.parseInt(params.get('page') ?? '1', 10)
  return {
    search: params.get('search') ?? '',
    departmentId: params.get('department') || undefined,
    status: (STATUSES as readonly string[]).includes(status ?? '') ? (status as EmployeeStatusFilter) : 'all',
    page: Number.isFinite(page) && page > 1 ? page - 1 : 0
  }
}

function toParams(value: EmployeeFiltersValue, page = 0): URLSearchParams {
  const params = new URLSearchParams()
  if (value.search) params.set('search', value.search)
  if (value.departmentId) params.set('department', value.departmentId)
  if (value.status !== 'all') params.set('status', value.status)
  if (page > 0) params.set('page', String(page + 1))
  return params
}

export function EmployeesPage() {
  const [params, setParams] = useSearchParams()
  const current = readParams(params)
  const filters: EmployeeFiltersValue = { search: current.search, departmentId: current.departmentId, status: current.status }
  const query = useEmployees({ search: current.search, departmentId: current.departmentId, status: current.status, page: current.page })
  const departments = useDepartments()
  const filtered = current.search !== '' || current.departmentId !== undefined || current.status !== 'all' || current.page > 0
  const reset = () => setParams(new URLSearchParams())

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 min-[768px]:flex-row min-[768px]:items-end min-[768px]:justify-between">
        <PageHeading title="Сотрудники" caption="Люди портала, их отделы и доступы" />
        <Button asChild className="w-full min-[768px]:w-auto">
          <Link to="/admin/employees/new">
            <PlusIcon />
            Добавить сотрудника
          </Link>
        </Button>
      </header>
      <EmployeeFilters
        value={filters}
        onChange={(value) => setParams(toParams(value))}
        departments={departments.data}
        departmentsError={departments.isError}
        onReset={reset}
      />
      {query.isPending ? (
        <LoadingBlock text="Загружаем сотрудников…" />
      ) : query.isError ? (
        <ErrorBlock title="Не удалось загрузить сотрудников" message={query.error.message} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        filtered ? (
          <EmptyBlock
            icon={<PeopleIcon />}
            title="Сотрудники не найдены"
            text="Измените запрос или сбросьте фильтры"
            action={
              <Button variant="outline" size="sm" onClick={reset}>
                Сбросить фильтры
              </Button>
            }
          />
        ) : (
          <EmptyBlock
            icon={<PeopleIcon />}
            title="Сотрудников пока нет"
            text="Добавьте первого сотрудника — он получит временный пароль для входа"
            action={
              <Button asChild>
                <Link to="/admin/employees/new">
                  <PlusIcon />
                  Добавить сотрудника
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          <EmployeeTable items={query.data.items} busy={query.isPlaceholderData} />
          <Pagination
            page={current.page}
            pageSize={query.data.limit}
            total={query.data.total}
            onPageChange={(next) => setParams(toParams(filters, next))}
          />
        </>
      )}
    </section>
  )
}
