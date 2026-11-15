# Architecture: add-featurer-foundation

## Scope
Изменение затрагивает:
- **бэкенд, модуль `auth`:** справочник сотрудников и отделов, админ-API, расширение ролей, начальная загрузка из файла, профиль текущего пользователя;
- **бэкенд, модуль `portal`:** читает ФИО автора в очереди заявок;
- **общий код `shared`:** одна функция полного имени;
- **веб-портал `portal/`:** роль `admin`, меню, страницы «Сотрудники» и «Отделы», имя в шапке.

`notifications`, `telegram`, `control-center` и `manager-helper` не меняются: профиль получает новые поля, а клиенты разбирают его без `.strict()`.

---

## Backend — Domain Model

Слои и стиль — как в `auth` и `portal`: `domain` (агрегаты, VO, порты-абстрактные классы) → `application` (use case'ы) → `infrastructure` (Slonik) → `interface` (HTTP, zod-схемы). Новый код остаётся внутри `auth`, отдельного модуля `org` нет (решение продукта).

### Entities
| Name | Status | Aggregate root? | Ключевые поля | Назначение |
|---|---|---|---|---|
| `User` (auth) | existing, меняется | да | + метод `activate()` (парный к `deactivate()`); поля прежние | Учётная запись. Профиль в агрегат не входит, чтобы запись профиля не трогала `password_hash` |
| `EmployeeProfile` (auth) | new | да | `userId`, `name: PersonName`, `departmentId?`, `position?`, `email?: Email`, `scrmEmployeeId?` | Кадровые данные сотрудника, 1:1 с `User`. Отсутствие строки равно пустому профилю |
| `Department` (auth) | new | да | `id: string`, `name: DepartmentName`, `headUserId?` | Отдел плоского справочника с необязательным руководителем |
| `Role` (auth) | existing, меняется | — | значения `developer`, `admin` | Закрытое множество ролей |

### Aggregates
| Aggregate | Root entity | Входит в состав (entities/VO) | Инварианты, которые защищает |
|---|---|---|---|
| `User` | `User` | `Login`, `PasswordHash` | Прежние (пароль, `mustChangePassword`, `isActive`). `activate()` и `deactivate()` идемпотентны |
| `EmployeeProfile` | `EmployeeProfile` | `PersonName`, `Email` | Фамилия и имя непустые; email, если задан, корректен и приведён к единому виду. Уникальность email и существование отдела проверяются на уровне БД и use case'а, а не внутри агрегата |
| `Department` | `Department` | `DepartmentName` | Название непустое. Уникальность названия, существование руководителя и «нельзя удалить непустой» проверяются use case'ом и БД |

Инвариант «всегда есть активный администратор» принадлежит не одному агрегату, а набору пользователей, поэтому его держит прикладной сервис `ActiveAdminGuard` под блокировкой (см. design, п. 4).

### Value Objects
| Name | Поля | Почему VO (immutable/self-validating) |
|---|---|---|
| `PersonName` | `lastName`, `firstName`, `middleName?` | Обрезает пробелы, требует фамилию и имя, хранит части отдельно |
| `Email` | `value` | Обрезает пробелы, приводит к нижнему регистру, проверяет формат; пустая строка превращается в «нет email» |
| `DepartmentName` | `value` | Обрезает пробелы, непустое, ограничение длины |
| `Role` | `'developer' \| 'admin'` | Закрытое множество, неизвестное значение отвергается при чтении, сидировании и в API |
| `formatFullName` | функция в `shared/people` | Чистая функция `({lastName, firstName, middleName}, login) → string`, единое правило для `auth` и `portal` (см. design, п. 8) |

### Services
| Service | Слой | Ответственность |
|---|---|---|
| `ProvisionEmployee` | application | Единый путь создания сотрудника: `User` с временным паролем + `EmployeeProfile` + роли. Используется админкой и загрузкой |
| `ActiveAdminGuard` | application | Берёт advisory-блокировку и проверяет, что после операции остаётся хотя бы один активный `admin`; иначе бросает `LastAdminError` |
| `CreateEmployeeUseCase` | application | Создание сотрудника из админки, ответ с временным паролем |
| `UpdateEmployeeProfileUseCase` | application | Правка профиля («не переданное остаётся, пустое очищает») |
| `ReplaceEmployeeRolesUseCase` | application | Замена набора ролей под `ActiveAdminGuard` |
| `DismissEmployeeUseCase` / `RestoreEmployeeUseCase` | application | Увольнение (`setActive(false)` + отзыв сессий в одной транзакции) и возврат |
| `ListEmployeesUseCase` / `GetEmployeeUseCase` | application | Чтение списка с поиском (по фамилии, имени, отчеству, логину и email), фильтрами, пагинацией и карточки |
| `CreateDepartmentUseCase` / `UpdateDepartmentUseCase` / `DeleteDepartmentUseCase` / `ListDepartmentsUseCase` | application | CRUD отделов, проверка руководителя и пустоты отдела |
| `SeedDirectoryUseCase` | application | Начальная загрузка: проверка всего файла, подготовка хэшей, одна транзакция. Заменяет `SeedUsersUseCase` (прежний формат входит как подмножество) |
| `GetCurrentUserUseCase` | application, existing | Дополнительно читает профиль и отдел для `GET /auth/me` |
| `UserRepository` | domain port, existing | + `replaceRoles`, `setActive`, `countActiveAdmins` |
| `UserProfileRepository` | domain port, new | Чтение и запись профиля, проверка занятости email |
| `DepartmentRepository` | domain port, new | Отделы, подсчёт сотрудников, назначение руководителя |
| `EmployeeQuery` | domain port, new | Read-модель списка и карточки (соединение пользователя, профиля, отдела, ролей) |
| `AdminLock` | domain port, new | Взять глобальную блокировку внутри текущей транзакции |
| `Slonik*` реализации | infrastructure, new | `SlonikUserProfileRepository`, `SlonikDepartmentRepository`, `SlonikEmployeeQuery`, `PgAdminLock` |
| `AdminEmployeesController`, `AdminDepartmentsController` | interface, new | HTTP `/admin/*`, `@Roles('admin')`, схемы zod в `admin.schemas.ts` |
| `RequestQuery` (portal) | infrastructure, existing | `LEFT JOIN auth_user_profiles`, поле `authorFullName` в `RequestView` |

### Method Signatures (ключевые, по каждому сервису)
| Service.Method | Params | Returns | Краткое описание |
|---|---|---|---|
| `ProvisionEmployee.execute` | `{ login, name: PersonName, departmentId?, position?, email?, scrmEmployeeId?, roles: Role[], password?: string }` | `{ userId, generatedPassword? }` | Создаёт пользователя, профиль и роли; пароль генерируется, если не задан |
| `ActiveAdminGuard.run` | `<T>(change: () => Promise<T>)` | `Promise<T>` | Блокировка, выполнение изменения, проверка «остался активный админ», при нарушении откат с `LastAdminError` |
| `CreateEmployeeUseCase.execute` | `CreateEmployeeInput` | `{ employee: EmployeeView, temporaryPassword: string }` | Создание из админки |
| `UpdateEmployeeProfileUseCase.execute` | `userId, patch: ProfilePatch` | `EmployeeView` | Частичная правка профиля |
| `ReplaceEmployeeRolesUseCase.execute` | `userId, roles: Role[]` | `EmployeeView` | Замена набора ролей |
| `DismissEmployeeUseCase.execute` | `userId` | `EmployeeView` | Увольнение, отзыв всех refresh-сессий |
| `RestoreEmployeeUseCase.execute` | `userId` | `EmployeeView` | Возврат |
| `ListEmployeesUseCase.execute` | `{ search?, departmentId?, isActive?, limit, page }` | `{ items: EmployeeView[], total }` | Список по фамилии, имени, логину |
| `DeleteDepartmentUseCase.execute` | `departmentId` | `void` | 409 `DEPARTMENT_NOT_EMPTY`, если есть сотрудники |
| `SeedDirectoryUseCase.execute` | `SeedDirectoryInput { departments, users }` | `SeedDirectoryResult { created, skipped }` | Проверка, хэши вне транзакции, запись в одной транзакции в порядке «отделы → сотрудники → руководители» |
| `UserRepository.replaceRoles` | `userId, roles: Role[]` | `void` | `DELETE` + `INSERT` в одной транзакции |
| `UserRepository.setActive` | `userId, active: boolean` | `void` | Точечное обновление `is_active`, остальные колонки не трогает |
| `UserRepository.countActiveAdmins` | — | `number` | Число активных пользователей с ролью `admin` |
| `UserProfileRepository.isEmailTaken` | `email: Email, exceptUserId?` | `boolean` | Проверка уникальности без учёта регистра |
| `formatFullName` | `(name: {lastName?, firstName?, middleName?}, login: string)` | `string` | Полное имя или логин |

---

## Frontend — UI Model

В репозитории нет `frontend/CLAUDE.md` и слоёв FSD из шаблона: `portal/` устроен проще (`features/<name>/{model,ui}`, `pages/`, `layouts/`, `components/ui/`, `lib/`). Проектирую по существующей структуре портала, а не по FSD. Запросы — фабрики `queryOptions` в `*.queries.ts`, вызовы API — в `*.api.ts`, схемы ответа — zod в `*.schema.ts`, ошибки через `lib/errors`, публичный API фичи — `index.ts`.

### Pages
| Page | Route | Структура | Назначение |
|---|---|---|---|
| `EmployeesPage` | `/admin/employees` | `pages/` + хук `use-employees` | Список, поиск, фильтры, переход к карточке и созданию |
| `EmployeeCreatePage` | `/admin/employees/new` | `pages/` | Форма создания и окно с временным паролем |
| `EmployeePage` | `/admin/employees/:id` | `pages/` + хук `use-employee` | Карточка: профиль, роли, увольнение и возврат |
| `DepartmentsPage` | `/admin/departments` | `pages/` + хук `use-departments` | Список отделов, создание, правка, руководитель, удаление |

Все маршруты — под `RequireRole role="admin"`.

### Features (переиспользуемые модули с бизнес-логикой)
| Feature | Статус | Публичный API (index.ts) | model/ | Назначение |
|---|---|---|---|---|
| `employees` | new | `EmployeeTable`, `EmployeeFilters`, `EmployeeForm`, `RolesEditor`, `DismissAction`, `TemporaryPasswordDialog`, хуки мутаций, `employeesQuery`, `employeeQuery` | `employees.api.ts`, `employees.queries.ts`, `employees.schema.ts`, `use-create-employee.ts`, `use-update-employee.ts`, `use-replace-roles.ts`, `use-dismiss-employee.ts`, `use-restore-employee.ts` | Всё про сотрудников для админки |
| `departments` | new | `DepartmentTable`, `DepartmentForm`, `HeadPicker`, `departmentsQuery`, хуки мутаций | `departments.api.ts`, `departments.queries.ts`, `departments.schema.ts`, `use-*-department.ts` | Справочник отделов; `departmentsQuery` нужен и форме сотрудника, и фильтру |
| `auth` | existing, меняется | без новых экспортов | `session.store.ts`, схема профиля в `lib/schemas` | Профиль получает `fullName`, части ФИО, `position`, `department`; тип `Role` включает `admin` |
| `shell` | existing, меняется | `NavMenu`, `AppLayout` | — | Группа меню «Администрирование», имя пользователя в шапке |
| `requests` / `decision` | existing, меняется | без новых экспортов | схемы заявки | Поле `authorFullName`, показ имени автора вместо логина |

### UI-компоненты (page-local и shared)
| Component | Слой | Props (основные) | Назначение |
|---|---|---|---|
| `EmployeeTable` | `features/employees/ui` | `items`, `onOpen` | Таблица ФИО, логин, отдел, должность, роли, статус; уволенные визуально отличаются |
| `EmployeeFilters` | `features/employees/ui` | `value`, `onChange`, `departments` | Поиск, отдел, статус |
| `EmployeeForm` | `features/employees/ui` | `mode: 'create' \| 'edit'`, `initial`, `departments`, `onSubmit`, `fieldErrors` | Поля профиля; логин только для чтения в режиме правки |
| `RolesEditor` | `features/employees/ui` | `roles`, `onSave`, `lastAdminError` | Флажки `developer` и `admin`, пояснение про задержку |
| `DismissAction` | `features/employees/ui` | `employee`, `onDismiss`, `onRestore` | «Уволить» с подтверждением и «Вернуть» |
| `TemporaryPasswordDialog` | `features/employees/ui` | `password`, `onClose` | Показ пароля один раз с копированием |
| `DepartmentTable`, `DepartmentForm`, `HeadPicker` | `features/departments/ui` | `items`/`value`, колбэки | Список, форма названия и руководителя, поиск сотрудника |
| `Dialog` | `components/ui` | `open`, `title`, `onClose`, `dismissible`, `children` | Общая оболочка модальных окон (форма отдела, окно временного пароля); в портале нет модальных окон |
| `ConfirmDialog` | `components/ui` | `title`, `description`, `onConfirm`, `onCancel` | Подтверждение (увольнение, удаление отдела), поверх `Dialog` |
| `Pagination` | `components/ui` | `page`, `limit`, `total`, `onChange` | «Назад / Вперёд» и «Показано X–Y из N» без номеров страниц; заменяет три одинаковые копии в «Очереди», «Навыках» и «Мои заявки» |
| `Checkbox` | `components/ui` | `checked`, `onChange`, `label` | Флажок ролей; в портале есть только `Switch` |

Существующие `Table`, `Badge`, `Button`, `Input`, `Select`, `Alert`, `FormField`, `Textarea` из `components/ui` переиспользуются.

### Hooks (model)
| Hook | Расположение | Тип | Возвращает |
|---|---|---|---|
| `employeesQuery` | `features/employees/model/employees.queries.ts` | query options factory | список сотрудников по параметрам |
| `employeeQuery` | то же | query options factory | карточка сотрудника |
| `useCreateEmployee` | `use-create-employee.ts` | мутация, `gcTime: 0` | сотрудник и временный пароль (в кэш не попадает) |
| `useUpdateEmployee`, `useReplaceRoles`, `useDismissEmployee`, `useRestoreEmployee` | соответствующие файлы | мутации | обновлённая карточка, инвалидация списка и карточки |
| `departmentsQuery` | `features/departments/model/departments.queries.ts` | query options factory | все отделы |
| `useCreateDepartment`, `useUpdateDepartment`, `useDeleteDepartment` | соответствующие файлы | мутации | инвалидация отделов |
| `useEmployees` | `pages/use-employees.ts` | state-хук | параметры фильтра в адресе страницы и данные |

### Паттерны, которые нужно учесть при проектировании
- [x] Публичный API фичи только через `index.ts`
- [x] Запросы — через фабрики `queryOptions` в `*.queries.ts`, не голыми функциями
- [x] Ошибки API нормализуются в `lib/errors` (коды `LAST_ADMIN`, `EMAIL_TAKEN`, `LOGIN_TAKEN`, `DEPARTMENT_NOT_EMPTY` отображаются у поля или сообщением)
- [x] Скрытый раздел не монтируется (`RequireRole`), данные не запрашиваются
- [x] Временный пароль не сохраняется в кэше запросов, хранилищах и адресе
- [ ] `mediator/`, слоты `header/body/footer`, `isInitialLoad/isRefreshing` и `shared/ui-kit` — относятся к FSD-фронтенду из шаблона, в `portal/` не применяются

---

## Diagrams
Диаграммы — на доске Miro «add-featurer-foundation». Доска пока не создана: создание требует подтверждения (см. ниже).

### 1. Domain Entity Interaction
`User` 1—0..1 `EmployeeProfile`; `EmployeeProfile` N—0..1 `Department`; `Department` 0..1—`User` (руководитель, `ON DELETE SET NULL`); `User` 1—N `Role`; `PersonName`, `Email` внутри профиля; `DepartmentName` внутри отдела.
Miro link: `<будет добавлена после создания доски>`

### 2. External Modules Interaction
`portal-ui` → HTTP `/admin/*` и `/auth/me` → `auth`; `portal` (очередь заявок) → читает профиль автора из таблицы `auth_user_profiles` и использует `shared/people/formatFullName`; `auth` → `AuthSessionRepository.revokeAllForUser` при увольнении; CLI `seed:users` → `AuthSeedModule` → `SeedDirectoryUseCase`. Исходящих вызовов во внешние системы и событий outbox нет.
Miro link: `<будет добавлена после создания доски>`

### 3. Layer Interaction — от Controller до Response
Основной путь: `POST /admin/employees/:id/dismiss` → `JwtAuthGuard` → `PasswordChangeGuard` → `RolesGuard('admin')` → `AdminEmployeesController` → `DismissEmployeeUseCase` → транзакция (`AdminLock` → `UserRepository.setActive(false)` → `ActiveAdminGuard` проверка → `AuthSessionRepository.revokeAllForUser`) → `EmployeeQuery` → ответ. Ошибка `LastAdminError` откатывает транзакцию и отображается в 409 `LAST_ADMIN`.
Miro link: `<будет добавлена после создания доски>`

---

## Confirmation Checklist
- [x] Названия entity/aggregate/VO согласованы
- [x] Названия и сигнатуры ключевых методов сервисов согласованы
- [x] Структура фронтенда (`features/employees`, `features/departments`, страницы `/admin/*`) и отказ от FSD-шаблона согласованы
- [x] Диаграммы взаимодействия отражают ожидаемую реализацию (текстовые описания; доска Miro не создавалась)
- [x] Пользователь подтвердил переход к `ui-design.md` и `tasks.md`
