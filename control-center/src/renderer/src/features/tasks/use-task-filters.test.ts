import { describe, expect, it } from 'vitest'
import { pluralTasks } from './use-task-filters'

describe('pluralTasks', () => {
  it.each([
    [0, '0 задач'],
    [1, '1 задача'],
    [2, '2 задачи'],
    [4, '4 задачи'],
    [5, '5 задач'],
    [11, '11 задач'],
    [12, '12 задач'],
    [21, '21 задача'],
    [22, '22 задачи'],
    [111, '111 задач'],
    [128, '128 задач']
  ])('%i → %s', (n, text) => {
    expect(pluralTasks(n)).toBe(text)
  })
})
