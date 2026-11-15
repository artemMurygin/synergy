import type { Department } from './departments.schema'

export const departmentFixture: Department = {
  id: 'd-sales',
  name: 'Продажи',
  head: { id: 'u-petrova', fullName: 'Петрова Мария Сергеевна', isActive: true },
  employeeCount: 12
}

export const departmentWithoutHead: Department = { id: 'd-dev', name: 'Разработка', head: null, employeeCount: 5 }

export const departmentDismissedHead: Department = {
  id: 'd-mkt',
  name: 'Маркетинг',
  head: { id: 'u-pavlov', fullName: 'Павлов Артём Игоревич', isActive: false },
  employeeCount: 6
}

export const emptyDepartment: Department = { id: 'd-law', name: 'Юридический отдел', head: null, employeeCount: 0 }

export const employeeOptionFixtures = [
  { id: 'u-petrova', fullName: 'Петрова Мария Сергеевна', department: { id: 'd-sales', name: 'Продажи' }, isActive: true },
  { id: 'u-polyakova', fullName: 'Полякова Елена Викторовна', department: { id: 'd-acc', name: 'Бухгалтерия' }, isActive: true },
  { id: 'u-prohorov', fullName: 'Прохоров Дмитрий', department: null, isActive: true }
]
