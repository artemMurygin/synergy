<!--
  Правила выполнения:
  - Бэкенд: `cd backend`, тесты `npm test` (vitest), типы `npm run typecheck`, линт `npm run lint`.
    Интеграционные тесты БД идут только при заданной `PROGRAMS_ETL_TEST_ADMIN_URL` (иначе пропускаются): перед
    первой группой убедиться, что переменная задана, иначе миграционные и репозиторные тесты не доказывают ничего.
  - Портал: `cd portal`, тесты `npm test` (vitest), типы `npm run typecheck`.
  - Номера миграций начинаются с 031 (последняя в репозитории — 030); перед первой миграцией сверить `ls backend/db/migrations`.
  - TDD: для каждой содержательной единицы 4 отдельных пункта: тест → red → реализация → green.
  - Макеты нарисованы в `design/synergy-design.pen` внутри фрейма Portal (`t2DLO`), Node ID указаны в UI-задачах
    (группы 15–19) и в `ui-design.md`. Перед вёрсткой прочитать нужный фрейм через `mcp__pencil__*` (`get_app_state`,
    затем `execute`/`Get`) и сверить итог со скриншотом; `.pen` не читать и не править иначе.
-->

## 1. Миграция ролей: допустимая роль `admin`

- [x] 1.1 Написать интеграционный тест миграции `031_auth_roles_admin` по образцу `src/database/postgres/auth-user-roles-migration.spec.ts`: роли `developer` и `admin` допускаются, неизвестная роль отвергается `CHECK`, у одного пользователя можно две роли, существующие строки не теряются; убедиться, что раннер видит тест
- [ ] 1.2 Прогнать тест из 1.1 и зафиксировать, что он падает (red): `admin` отвергается прежним `CHECK`
- [x] 1.3 Добавить `backend/db/migrations/031_auth_roles_admin.sql`: `DROP CONSTRAINT IF EXISTS auth_user_roles_role_check`, новый `CHECK (role IN ('developer', 'admin'))`; в комментарии — откат (сначала `DELETE FROM auth_user_roles WHERE role = 'admin'`)
- [ ] 1.4 Прогнать тест из 1.1 и зафиксировать, что он зелёный (green), миграционные тесты соседних миграций не сломаны

## 2. Миграции отделов и профиля сотрудника

- [x] 2.1 Написать интеграционный тест миграций `032_auth_departments` и `033_auth_user_profiles`: уникальность названия отдела без учёта регистра; `head_user_id` с `ON DELETE SET NULL`; профиль 1:1 с пользователем и удаляется каскадом; уникальный email без учёта регистра, но несколько профилей без email допускаются; `CHECK` длин (ФИО, должность и название — 200, ID в SCRM — 64, email — 254); удаление отдела с профилями отвергается (`RESTRICT`); пользователь без профиля остаётся рабочим
- [ ] 2.2 Прогнать тесты из 2.1 и зафиксировать, что они падают (red): таблиц ещё нет
- [x] 2.3 Добавить `032_auth_departments.sql` (`id TEXT PK`, `name`, `head_user_id`, `UNIQUE (lower(name))`) и `033_auth_user_profiles.sql` (`user_id PK`, `last_name`, `first_name`, `middle_name`, `department_id`, `position`, `email`, `scrm_employee_id`, `UNIQUE (lower(email)) WHERE email IS NOT NULL`, индекс по `department_id`, `CHECK` длин); в комментариях — откат (`DROP TABLE`)
- [ ] 2.4 Прогнать тесты из 2.1 и зафиксировать, что они зелёные (green), миграционные тесты `auth` и `portal` не сломаны

## 3. shared: полное имя (`formatFullName`)

- [x] 3.1 Написать unit-тесты `shared/people/full-name` по спеке `employee-directory` («Полное имя»): три части, без отчества, без пробелов по краям и двойных пробелов, все части пусты → логин, пустые строки считаются незаполненными
- [x] 3.2 Прогнать тесты из 3.1 и зафиксировать, что они падают (red): функции нет
- [x] 3.3 Реализовать `backend/src/shared/people/full-name.ts` (чистая функция, без зависимостей от модулей)
- [x] 3.4 Прогнать тесты из 3.1 и зафиксировать, что они зелёные (green), `npm run typecheck` проходит

## 4. auth, домен: роль `admin`, value objects, `User.activate`

- [x] 4.1 Написать unit-тесты: `Role.of('admin')` допустим, `Role.ALL` содержит обе роли; `PersonName` (обрезка, фамилия и имя обязательны, длина 200); `Email` (приведение к нижнему регистру, формат, пустая строка → нет email, длина 254); `DepartmentName` (непустое, длина 200); `User.activate()` и `deactivate()` идемпотентны
- [x] 4.2 Прогнать тесты из 4.1 и зафиксировать, что они падают (red) из-за отсутствия реализации
- [x] 4.3 Расширить `domain/role.ts` значением `admin`; добавить `domain/person-name.ts`, `domain/email.ts`, `domain/department-name.ts`; добавить `User.activate()`; добавить доменные ошибки (`LastAdminError`, `EmailTakenError`, `LoginTakenError`, `DepartmentNameTakenError`, `DepartmentNotEmptyError`, `EmployeeNotFoundError`, `DepartmentNotFoundError`) в `domain/errors.ts`
- [x] 4.4 Прогнать тесты из 4.1 и зафиксировать, что они зелёные (green); существующие тесты `auth` (включая `role`, `user`) не сломаны

## 5. auth, домен: `EmployeeProfile`, `Department` и порты

- [x] 5.1 Написать unit-тесты на агрегаты `EmployeeProfile` (создание, частичная правка «не переданное остаётся, пустое очищает», пустая строка очищает необязательное поле, фамилия и имя остаются непустыми) и `Department` (создание, переименование, назначение и снятие руководителя)
- [x] 5.2 Прогнать тесты из 5.1 и зафиксировать, что они падают (red)
- [x] 5.3 Реализовать `domain/employee-profile.ts`, `domain/department.ts` и порты: `UserProfileRepository`, `DepartmentRepository`, `EmployeeQuery` (read-модели `EmployeeView`, `DepartmentView`), `AdminLock`; расширить `UserRepository` методами `replaceRoles`, `setActive`, `countActiveAdmins`
- [x] 5.4 Прогнать тесты из 5.1 и зафиксировать, что они зелёные (green), `npm run typecheck` проходит (реализации портов появятся в группах 6–7, test-doubles в группе 8)

## 6. auth, инфраструктура: репозитории записи

- [x] 6.1 Написать интеграционные тесты в `postgres-auth.repositories.spec.ts` и новом `postgres-employee.repositories.spec.ts`: `replaceRoles` заменяет набор, пустой набор снимает все; `setActive` не трогает `password_hash` и прочие колонки (в том числе при конкурентной смене пароля); `countActiveAdmins` не считает уволенных; `SlonikUserProfileRepository` (сохранение, чтение, отсутствие строки, `isEmailTaken` без учёта регистра и с `exceptUserId`); `SlonikDepartmentRepository` (создание, переименование, руководитель, подсчёт сотрудников, удаление пустого, отказ при непустом)
- [ ] 6.2 Прогнать тесты из 6.1 и зафиксировать, что они падают (red)
- [x] 6.3 Реализовать новые методы `SlonikUserRepository` и классы `SlonikUserProfileRepository`, `SlonikDepartmentRepository` (транзакции через `TransactionRunnerPort`, нарушения уникальности и `RESTRICT` отображаются в доменные ошибки)
- [ ] 6.4 Прогнать тесты из 6.1 и зафиксировать, что они зелёные (green), существующие репозиторные тесты `auth` не сломаны

## 7. auth, инфраструктура: чтение сотрудников и блокировка администратора

- [x] 7.1 Написать интеграционные тесты: `SlonikEmployeeQuery` (список сотрудников с профилем, отделом и ролями; пользователь без профиля; сортировка по фамилии, имени, логину; поиск по фамилии, имени, отчеству, логину и email без учёта регистра с экранированием `%` и `_`; фильтр по отделу; фильтр по увольнению; пагинация и `total`; карточка по id и `null` для неизвестного); `PgAdminLock` (две параллельные транзакции сериализуются по общей блокировке, блокировка снимается с транзакцией)
- [ ] 7.2 Прогнать тесты из 7.1 и зафиксировать, что они падают (red)
- [x] 7.3 Реализовать `SlonikEmployeeQuery` (использует `shared/people/formatFullName` для `fullName`) и `PgAdminLock` на `pg_advisory_xact_lock`
- [ ] 7.4 Прогнать тесты из 7.1 и зафиксировать, что они зелёные (green), регрессий нет

## 8. auth, application: `ActiveAdminGuard`, `ProvisionEmployee`, создание сотрудника

- [x] 8.1 Расширить `application/test-doubles.ts` (in-memory `UserRepository`, `UserProfileRepository`, `DepartmentRepository`, `EmployeeQuery`, `AdminLock`) и написать unit-тесты по спеке `user-administration`: `ActiveAdminGuard` (откат с `LastAdminError`, если админов не остаётся; проходит, если остался другой активный; берёт блокировку); `ProvisionEmployee` (пользователь с временным паролем и `mustChangePassword`, профиль, роли, пароль генерируется только если не задан); `CreateEmployeeUseCase` (ответ с временным паролем; 409 на логин и email; 404 на отдел; 400 на пустые фамилию и имя и на длины; при ошибке ничего не создаётся)
- [x] 8.2 Прогнать тесты из 8.1 и зафиксировать, что они падают (red)
- [x] 8.3 Реализовать `ActiveAdminGuard`, `ProvisionEmployee` и `CreateEmployeeUseCase`
- [x] 8.4 Прогнать тесты из 8.1 и зафиксировать, что они зелёные (green), существующие unit-тесты `auth` не сломаны

## 9. auth, application: правка профиля, роли, увольнение, возврат

- [x] 9.1 Написать unit-тесты по спеке `user-administration`: `UpdateEmployeeProfileUseCase` («не переданное остаётся, пустое очищает», логин не меняется, 409 на email, 404 на отдел и сотрудника, 400 на пустые фамилию и имя, правка уволенного); `ReplaceEmployeeRolesUseCase` (замена набора, пустой набор, 400 на неизвестную роль, `LAST_ADMIN` при снятии `admin` у последнего, проход при втором активном администраторе); `DismissEmployeeUseCase` (`setActive(false)` и отзыв всех refresh-сессий в одной транзакции, `LAST_ADMIN`, идемпотентность, 404); `RestoreEmployeeUseCase` (возврат с прежним паролем и профилем, идемпотентность)
- [x] 9.2 Прогнать тесты из 9.1 и зафиксировать, что они падают (red)
- [x] 9.3 Реализовать `UpdateEmployeeProfileUseCase`, `ReplaceEmployeeRolesUseCase`, `DismissEmployeeUseCase`, `RestoreEmployeeUseCase`
- [x] 9.4 Прогнать тесты из 9.1 и зафиксировать, что они зелёные (green), регрессий нет

## 10. auth, application: чтение сотрудников и отделы

- [x] 10.1 Написать unit-тесты: `ListEmployeesUseCase` (передача поиска, фильтров, `limit` и `page`; без фильтра по увольнению возвращаются и активные, и уволенные), `GetEmployeeUseCase` (404 для неизвестного); `ListDepartmentsUseCase` (число сотрудников, руководитель с полным именем, сортировка по названию); `CreateDepartmentUseCase`, `UpdateDepartmentUseCase`, `DeleteDepartmentUseCase` (409 на название, 404 на несуществующего руководителя и отдел, 409 `DEPARTMENT_NOT_EMPTY` в том числе из-за уволенного сотрудника, снятие руководителя, при удалении отдела связь с руководителем исчезает)
- [x] 10.2 Прогнать тесты из 10.1 и зафиксировать, что они падают (red)
- [x] 10.3 Реализовать перечисленные use case'ы
- [x] 10.4 Прогнать тесты из 10.1 и зафиксировать, что они зелёные (green), регрессий нет

## 11. auth: профиль текущего пользователя

- [x] 11.1 Обновить `get-current-user.use-case.spec.ts` по спеке `user-auth` («Профиль текущего пользователя»): ответ содержит полное имя, части ФИО, должность и отдел (id и название); пользователь без профиля — полное имя равно логину, остальное пусто; данные читаются из БД и видны без повторного входа; email и ID в SCRM не возвращаются
- [x] 11.2 Прогнать тест из 11.1 и зафиксировать, что он падает (red)
- [x] 11.3 Расширить `GetCurrentUserUseCase` и ответ `GET /auth/me` (схемы в `auth.schemas.ts`, ответ контроллера)
- [x] 11.4 Прогнать тесты из 11.1 и тесты `auth.controller.spec.ts` и зафиксировать, что они зелёные (green); `control-center` и `manager-helper`: прогнать тесты, затрагивающие разбор профиля, и зафиксировать, что дополнительные поля их не ломают

## 12. Начальная загрузка: `SeedDirectoryUseCase`, файл, команда

- [x] 12.1 Переписать и расширить тесты `seed-users.use-case.spec.ts` и `seed-users.cli.spec.ts` по спекам `employee-directory`, `user-auth`, `user-roles`: разбор файла `{departments, users}` и прежнего массива; проверка всего файла до записи (неизвестный отдел, руководитель, роль, дубль логина и email в файле, конфликт email с существующим сотрудником, нарушение длин — загрузка не создаёт ничего); режим «только новые» (существующие отделы и логины пропускаются целиком, включая роли, профиль и пароль; правки администратора не затираются); роли только новому сотруднику; порядок «отделы → сотрудники → руководители» без цикла; временный пароль выводится один раз; хэши считаются до транзакции; запись в одной транзакции (ошибка в середине откатывает всё); при заданных `AUTH_SEED_FILE` и `AUTH_SEED_USERS` — ошибка
- [x] 12.2 Прогнать тесты из 12.1 и зафиксировать, что они падают (red)
- [x] 12.3 Реализовать `SeedDirectoryUseCase` (заменяет `SeedUsersUseCase`), разбор файла в `seed-users.cli.ts`, чтение пути из `AUTH_SEED_FILE` и аргумента `--file` в `scripts/seed-users.mjs`, поддержку прежнего `AUTH_SEED_USERS` в `env.schema.ts`; добавить `backend/db/seeds/users.example.json`, `.gitignore` для реального файла и обновить `backend/README.md` (формат файла, «только новые», первый администратор, выдача `admin` существующему пользователю через SQL)
- [ ] 12.4 Прогнать тесты из 12.1 и зафиксировать, что они зелёные (green); вручную прогнать `npm run seed:users` на пустой тестовой БД с `users.example.json` и зафиксировать отчёт (созданы отделы и сотрудники, пароли выведены), затем повторный запуск (всё `skipped`)

## 13. auth, HTTP: админ-API

- [x] 13.1 Написать тесты контроллеров и сквозной e2e на бэкенде по спеке `user-administration`: `/admin/*` отвечают 401 без токена, 403 без роли `admin` (в том числе у пользователя только с `developer`), `admin` без `developer` не получает прав разработчика; список с поиском, фильтрами, пагинацией и 400 на недопустимые параметры; создание (201, временный пароль только в ответе создания, повторный `GET` пароля не содержит, 409 логин и email, 404 отдел, 400 поля); `PATCH` с семантикой «не переданное остаётся, пустое очищает» и неизменяемым логином; `PUT roles`; `dismiss` и `restore` (идемпотентность, отзыв сессий, `LAST_ADMIN` как 409 с кодом); CRUD отделов (409 название и `DEPARTMENT_NOT_EMPTY`); отозванная роль `admin` действует в выданном токене до его истечения
- [x] 13.2 Прогнать тесты из 13.1 и зафиксировать, что они падают (red)
- [x] 13.3 Реализовать `interface/http/admin.schemas.ts`, `admin-employees.controller.ts`, `admin-departments.controller.ts` (`@Roles('admin')` на классе), отображение ошибок в `auth-error-status.ts` (`LAST_ADMIN`, `EMAIL_TAKEN`, `LOGIN_TAKEN`, `DEPARTMENT_NAME_TAKEN`, `DEPARTMENT_NOT_EMPTY` — 409; `EMPLOYEE_NOT_FOUND`, `DEPARTMENT_NOT_FOUND` — 404); подключить провайдеры и контроллеры в `auth.module.ts`; убедиться, что `GET /users` не изменился
- [x] 13.4 Прогнать тесты из 13.1 и все тесты `auth` и зафиксировать, что они зелёные (green); `npm run typecheck` и `npm run lint` проходят

## 14. portal (бэкенд): полное имя автора

- [ ] 14.1 Обновить тесты `request-read.use-cases.spec.ts`, `queue-agents.use-cases.spec.ts`, `postgres-portal.repositories.spec.ts` и `portal-flow.e2e.spec.ts` по спеке `featurer-requests`: автор в очереди и в карточке для разработчика содержит `id`, `login` и `fullName`; автор без профиля — полное имя равно логину; уволенный автор не пропадает из очереди; «Мои заявки» не ломаются
- [ ] 14.2 Прогнать тесты из 14.1 и зафиксировать, что они падают (red)
- [x] 14.3 Добавить `LEFT JOIN auth_user_profiles` в `slonik-request.query.ts`, поле `authorFullName` в `RequestView` (имя собирается общей `formatFullName`), обновить ответы `requests.controller.ts` и схемы; `portal` не импортирует внутренности `auth`
- [ ] 14.4 Прогнать тесты из 14.1 и все тесты `portal` и зафиксировать, что они зелёные (green), регрессий нет

## 15. portal/: схемы, общие компоненты UI

- [x] 15.1 Написать тесты (vitest + Testing Library) на `Checkbox`, `Dialog`, `ConfirmDialog`, `Pagination` по `ui-design.md` («Общие правила», «Новые компоненты»): `Checkbox` — подпись, клавиатура, `aria-checked`; `Dialog` — `role="dialog"`/`alertdialog`, `aria-modal`, фокус на первое поле или «Отмена», ловушка фокуса, `Esc` и фон закрывают, а при `dismissible={false}` нет, возврат фокуса на открывший элемент; `ConfirmDialog` — подтвердить и отменить; `Pagination` — «Назад»/«Вперёд» недоступны на краях, «Показано X–Y из N»; и на схему профиля с ролью `admin`, `fullName`, частями ФИО, должностью и отделом (`lib/schemas`)
- [x] 15.2 Прогнать тесты из 15.1 и зафиксировать, что они падают (red)
- [x] 15.3 Реализовать `components/ui/{checkbox,dialog,confirm-dialog,pagination}.tsx` (оформление по токенам `portal/src/styles/index.css`; макеты мастеров в `design/synergy-design.pen`, раздел `Компоненты админки` `w24pn`: `Checkbox / Master` `F0rv3`, `Dialog / Master` `x8qStm`, `ConfirmDialog / Master` `thrBz`, `Pagination / Master` `zpDLL`; перед вёрсткой прочитать их через Pencil MCP), расширить `Role` значением `admin` и схему профиля; заменить три копии «Назад / Вперёд» в `QueuePage`, `SkillsPage`, `MyRequestsPage` общим `Pagination`
- [x] 15.4 Прогнать тесты из 15.1 и все тесты `portal` и зафиксировать, что они зелёные (green); `npm run typecheck` проходит; тексты на трёх страницах не изменились (существующие тесты страниц зелёные)

## 16. portal/: feature `departments`

- [x] 16.1 Написать тесты по спеке `featurer-admin-ui` («Раздел «Отделы»») и `ui-design.md` (экран 4): `departments.api` и схемы (разбор списка, обработка 409 и 404), `departmentsQuery`, мутации с инвалидацией; `DepartmentTable` (колонки, руководитель, число сотрудников, пустое состояние с «Создать отдел»); `DepartmentForm` в диалоге (проверка названия и длины 200 до отправки, 409 у поля названия, значения сохраняются); `HeadPicker` (поиск, только активные, назначенный уволенный руководитель остаётся с бейджем «Уволен», снятие); удаление с подтверждением и сообщением `DEPARTMENT_NOT_EMPTY`
- [x] 16.2 Прогнать тесты из 16.1 и зафиксировать, что они падают (red)
- [x] 16.3 Реализовать `features/departments` (`model/`: api, queries, схемы, мутации; `ui/`: `DepartmentTable`, `DepartmentForm`, `HeadPicker`; `index.ts`). Макеты (`design/synergy-design.pen`, Portal): `10 · Отделы` `KkNLj` — 1440 `d4ocQV`, 360 `fEnKt`, диалог на 360 `PYbW9`; состояния `oagGV`; диалоги формы `mtEZy`, `Q9jQOV` (409 названия, 404 руководителя); выбор руководителя `xsWmz`, `L62QAX` (пусто), `tebSc` (ошибка); удаление `BOGIP`, `fZ0oZ`; `HeadPicker / Master` `MphXJ`
- [x] 16.4 Прогнать тесты из 16.1 и зафиксировать, что они зелёные (green), `npm run typecheck` проходит

## 17. portal/: feature `employees` — модель

- [x] 17.1 Написать тесты на `employees.api` и схемы (разбор списка, карточки, ответа создания с временным паролем, ошибок `LOGIN_TAKEN`, `EMAIL_TAKEN`, `LAST_ADMIN`, `DEPARTMENT_NOT_FOUND`, 404), `employeesQuery` и `employeeQuery` (параметры из адреса: поиск, отдел, статус «Все» по умолчанию, страница), хуки мутаций (`useCreateEmployee` с `gcTime: 0` — пароль не попадает в кэш; обновление, роли, увольнение и возврат инвалидируют список и карточку)
- [x] 17.2 Прогнать тесты из 17.1 и зафиксировать, что они падают (red)
- [x] 17.3 Реализовать `features/employees/model/*` (`employees.api.ts`, `employees.queries.ts`, `employees.schema.ts`, `use-create-employee.ts`, `use-update-employee.ts`, `use-replace-roles.ts`, `use-dismiss-employee.ts`, `use-restore-employee.ts`) и нормализацию ошибок через `lib/errors`
- [x] 17.4 Прогнать тесты из 17.1 и зафиксировать, что они зелёные (green), `npm run typecheck` проходит

## 18. portal/: feature `employees` — компоненты

- [x] 18.1 Написать тесты по спеке `featurer-admin-ui` и `ui-design.md` (экраны 1–3): `EmployeeTable` (колонки, роли бейджами «Администратор», «Разработчик», «Сотрудник», статус «Активен»/«Уволен», уволенный приглушён, строка — ссылка на карточку, на 360 px карточки вместо таблицы); `EmployeeFilters` (поиск с задержкой 300 мс, отдел, чипы статуса, «Сбросить фильтры» только при активном фильтре); `EmployeeForm` (обязательные поля, формат email и длины до отправки, фокус на первом поле с ошибкой, логин только для чтения в режиме правки, 409 у полей логина и email); `RolesEditor` (флажки, сообщение для `LAST_ADMIN`, общая фраза о задержке без числа); `DismissAction` (подтверждение, предупреждение «Вы потеряете доступ к порталу» в своей карточке, «Вернуть» без подтверждения, `LAST_ADMIN`, нет действия «Удалить»); `TemporaryPasswordDialog` (пароль показан, копирование и состояния «Скопировано» и ошибка копирования, не закрывается по `Esc` и фону, после закрытия пароль недоступен, `beforeunload` пока открыт)
- [x] 18.2 Прогнать тесты из 18.1 и зафиксировать, что они падают (red)
- [x] 18.3 Реализовать `features/employees/ui/*` и `index.ts`. Макеты (`design/synergy-design.pen`, Portal): `07 · Сотрудники` `H3j8f` — 1440 `b6zB9`, 360 `OThdj`, состояния `eoMl7`; `08 · Новый сотрудник` `SHPmS` — 1440 `M4waO`, 360 `OtwLe`, ошибки формы `vsYOe`, окно временного пароля `YCXHb` (`L9S7o` обычное, `S8RWNM` «Скопировано», `JUfbi` ошибка копирования, `M1TAf` на 360); `09 · Карточка сотрудника` `zgkeZ` — 1440 `q8Chut`, 360 `T3ehel`, состояния `H1g9wE` (уволен, `LAST_ADMIN`, возврат, загрузка, ошибка, нет ФИО), подтверждения `IN8kE`, `zufSD` (своя карточка), `fy9Pj`, `knKZL` (360)
- [x] 18.4 Прогнать тесты из 18.1 и зафиксировать, что они зелёные (green), `npm run typecheck` проходит

## 19. portal/: страницы, маршруты, меню, шапка, автор в очереди

- [x] 19.1 Написать тесты по спекам `featurer-admin-ui` и `featurer-portal-ui` и `ui-design.md` (экраны 1–6): `EmployeesPage` (состояния загрузки, пусто «Сотрудников пока нет», «Сотрудники не найдены», ошибка с повтором, повторная загрузка не схлопывает данные, параметры в адресе), `EmployeeCreatePage` (после закрытия окна пароля переход в карточку созданного), `EmployeePage` (профиль, роли, увольнение, 404 через `NotFoundView`), `DepartmentsPage`; маршруты `/admin/*` под `RequireRole role="admin"` (без роли — «Мои заявки», данные не запрашиваются); `NavMenu` (администратор без `developer` не видит «Очередь» и «Навыки», у обеих ролей оба набора, пункты «Сотрудники» и «Отделы»); `AppLayout` (полное имя вместо логина, для пользователя без ФИО логин, обрезка длинного имени на 360 px, подпись роли «администратор» и «разработчик, администратор»); `QueuePage` и `RequestPage` (полное имя автора, логин для автора без ФИО)
- [x] 19.2 Прогнать тесты из 19.1 и зафиксировать, что они падают (red)
- [ ] 19.3 Реализовать `pages/{EmployeesPage,EmployeeCreatePage,EmployeePage,DepartmentsPage}.tsx` и хуки `use-employees`, `use-employee`, `use-departments`; добавить маршруты в `router.tsx`; обновить `features/shell/NavMenu.tsx` (группа «Администрирование») и `layouts/AppLayout.tsx` (имя в строке шапки, «Выйти» остаётся в меню; сокращение бренда на 1024–1280 px); показать `authorFullName` в `features/decision` и `pages/QueuePage`, `pages/RequestPage`. Макеты (`design/synergy-design.pen`, Portal): `11 · Шапка, меню и имя автора` `fyP8N` — шапки `CYZVd` (admin), `HaJUE` (admin+developer, длинное имя), 360 `hPgP8`, меню на 360 `vkAM0` (admin+developer), `JdQ3B` (admin); «Очередь» с ФИО `GbRfu`; заявка `n6GYy`, карточка автора `QoOu1`; вариант 390 «Очереди» и заявки не нарисован — собрать по существующим `Asg5q`, `lp3qZ`
- [x] 19.4 Прогнать тесты из 19.1 и все тесты `portal` и зафиксировать, что они зелёные (green); `npm run typecheck` и `npm run build` проходят

## 20. Интеграционная проверка, конфигурация и документация

- [ ] 20.1 Поднять бэкенд и портал на тестовой БД, выполнить `seed:users` с `users.example.json` (с ролью `admin` у первого пользователя) и вручную пройти по `specs/`: вход администратором, создание сотрудника (пароль виден один раз, при первом входе смена пароля), правка профиля и email-конфликт, выдача и снятие `developer`, увольнение (вход уволенного отклонён, сессии отозваны), возврат, попытка снять `admin` у единственного администратора (`LAST_ADMIN`), создание, переименование и удаление отделов, назначение руководителя, роль `admin` вместе с `developer` у одного пользователя, обычный сотрудник не видит админку, имя автора в очереди; результат зафиксировать в заметке к change
- [x] 20.2 Убедиться, что origin портала есть в `AUTH_ALLOWED_ORIGINS`, а `SameSite` у cookie `mh_refresh` не менялся; сверить со `specs/user-roles`, что отзыв роли действует не позднее `AUTH_ACCESS_TTL`; проверить `control-center` и `manager-helper` на разбор нового профиля (вход и «Мои профили» работают)
- [x] 20.3 Обновить `FEATURER_ROADMAP.md`: описание Э1 (отделы справочные, `head` как справочное поле, файл — одноразовая загрузка, админка ведёт людей и доступы, сброса пароля нет), статус change и состояние кода; обновить `backend/README.md` (админ-API, `AUTH_SEED_FILE`)
- [x] 20.4 Запустить `openspec validate add-featurer-foundation --strict` и полные наборы тестов бэкенда (`npm test`, `npm run lint`, `npm run typecheck`) и портала (`npm test`, `npm run build`); зафиксировать, что всё зелёное

## 21. Code review

- [x] 21.1 Запустить code-review (скилл `code-review`) по всем изменениям фичи - от коммита, с которого начат change, до текущего HEAD: соответствие стандартам проекта и specs этого change
- [ ] 21.2 Исправить замечания ревью (блокирующие и существенные обязательно; остальные - исправить или явно отклонить с обоснованием), результат зафиксировать коммитом
- [ ] 21.3 Повторить code-review по правкам из 21.2 и убедиться, что блокирующих замечаний нет; прогнать тесты и зафиксировать, что они зелёные
