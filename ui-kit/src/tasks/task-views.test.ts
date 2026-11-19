import { describe, expect, it } from 'vitest'
import { selectedSegment, taskViewLayout, TASK_VIEW_DEFAULT } from './task-views'

describe('task-views', () => {
  it('desktop — все пять представлений, меню нет', () => {
    expect(taskViewLayout('desktop')).toEqual({
      segments: ['all', 'mine', 'watching', 'created', 'overdue'],
      menu: [],
    })
  })

  it('tablet — «Все», «Мои», «Ещё»; в меню три представления', () => {
    expect(taskViewLayout('tablet')).toEqual({
      segments: ['all', 'mine'],
      menu: ['watching', 'created', 'overdue'],
    })
  })

  it('mobile — «Все», «Мои», «Просрочено», «Ещё»', () => {
    expect(taskViewLayout('mobile')).toEqual({
      segments: ['all', 'mine', 'overdue'],
      menu: ['watching', 'created'],
    })
  })

  it('представление из меню подсвечивает «Ещё»', () => {
    expect(selectedSegment('tablet', 'watching')).toBe('more')
    expect(selectedSegment('tablet', 'mine')).toBe('mine')
    expect(selectedSegment('mobile', 'overdue')).toBe('overdue')
    expect(selectedSegment('tablet', 'overdue')).toBe('more')
    expect(selectedSegment('desktop', 'created')).toBe('created')
  })

  it('по умолчанию «Мои»', () => {
    expect(TASK_VIEW_DEFAULT).toBe('mine')
  })
})
