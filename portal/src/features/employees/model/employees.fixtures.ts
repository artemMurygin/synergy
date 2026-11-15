export const employeeFixture = {
  id: 'e1',
  login: 'ivanov',
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Петрович',
  fullName: 'Иванов Иван Петрович',
  department: { id: 'd1', name: 'Бухгалтерия' },
  position: 'Бухгалтер',
  email: 'ivanov@example.com',
  scrmEmployeeId: 'scrm-1',
  roles: ['developer' as const],
  isActive: true
}

export const adminEmployeeFixture = {
  ...employeeFixture,
  id: 'e2',
  login: 'akotova',
  lastName: 'Котова',
  firstName: 'Анна',
  middleName: 'Сергеевна',
  fullName: 'Котова Анна Сергеевна',
  department: { id: 'd2', name: 'Администрация' },
  position: 'Руководитель портала',
  roles: ['admin' as const, 'developer' as const]
}

export const plainEmployeeFixture = {
  ...employeeFixture,
  id: 'e3',
  login: 'ikuznetsova',
  lastName: 'Кузнецова',
  firstName: 'Ирина',
  middleName: 'Павловна',
  fullName: 'Кузнецова Ирина Павловна',
  roles: []
}

export const dismissedEmployeeFixture = {
  ...employeeFixture,
  id: 'e4',
  login: 'olebedev',
  lastName: 'Лебедев',
  firstName: 'Олег',
  middleName: 'Викторович',
  fullName: 'Лебедев Олег Викторович',
  department: { id: 'd3', name: 'Продажи' },
  position: 'Менеджер по продажам',
  roles: [],
  isActive: false
}

export const bareEmployeeFixture = {
  ...employeeFixture,
  id: 'e5',
  login: 'pnikitin',
  lastName: 'Никитин',
  firstName: 'Павел',
  middleName: null,
  fullName: 'Никитин Павел',
  department: null,
  position: null,
  email: null,
  scrmEmployeeId: null,
  roles: []
}

/** A user from before the directory: only a login, no name. */
export const noNameEmployeeFixture = {
  ...bareEmployeeFixture,
  id: 'e6',
  login: 'petrov',
  lastName: null,
  firstName: null,
  fullName: 'petrov'
}
