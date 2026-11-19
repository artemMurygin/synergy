import { describe, expect, it } from 'vitest'
import {
  callStatus,
  formatArgs,
  formatDetails,
  groupSummary,
  pluralizeCalls,
  statusLabel,
  type ToolCallView,
} from './tool-status'

const call = (status: ToolCallView['status'], id = '1'): ToolCallView => ({
  id,
  name: 'search_books',
  args: {},
  status,
})

describe('callStatus', () => {
  it('is running while the message runs and the call has no result', () => {
    expect(callStatus({ messageRunning: true, result: undefined, isError: false })).toBe('running')
  })
  it('is complete with a result or in a finished message', () => {
    expect(callStatus({ messageRunning: true, result: 'ok', isError: false })).toBe('complete')
    expect(callStatus({ messageRunning: false, result: undefined, isError: false })).toBe('complete')
  })
  it('is error when the tool failed', () => {
    expect(callStatus({ messageRunning: false, result: 'boom', isError: true })).toBe('error')
  })
})

describe('pluralizeCalls', () => {
  it.each([
    [1, '1 вызов'],
    [2, '2 вызова'],
    [4, '4 вызова'],
    [5, '5 вызовов'],
    [11, '11 вызовов'],
    [21, '21 вызов'],
  ])('%i -> %s', (count, text) => {
    expect(pluralizeCalls(count)).toBe(text)
  })
})

describe('groupSummary', () => {
  it('is running while at least one call is not finished', () => {
    expect(groupSummary([call('complete'), call('running', '2')])).toMatchObject({
      state: 'running',
      status: 'выполняется',
    })
  })
  it('shows the count and "готово" when all calls finished', () => {
    expect(groupSummary([call('complete'), call('complete', '2'), call('complete', '3')])).toEqual({
      state: 'done',
      title: '3 вызова инструментов',
      status: '3 готово',
    })
  })
  it('marks the group when a call failed', () => {
    expect(groupSummary([call('complete'), call('error', '2')])).toMatchObject({
      state: 'error',
      status: 'ошибка',
    })
  })
})

describe('statusLabel', () => {
  it('names every call state', () => {
    expect(statusLabel('running')).toBe('выполняется')
    expect(statusLabel('complete')).toBe('завершён')
    expect(statusLabel('error')).toBe('ошибка')
  })
})

describe('formatArgs', () => {
  it('joins the arguments of an object into one line', () => {
    expect(formatArgs({ книги: ['ДПО', 'Магистратура'], город: 'Москва' })).toBe(
      'книги: ДПО, Магистратура, город: Москва',
    )
  })
  it('is empty without arguments', () => {
    expect(formatArgs(undefined)).toBe('')
    expect(formatArgs(null)).toBe('')
  })
})

describe('formatDetails', () => {
  it('pretty prints objects and keeps strings as they are', () => {
    expect(formatDetails({ a: 1 })).toBe('{\n  "a": 1\n}')
    expect(formatDetails('3 программы')).toBe('3 программы')
    expect(formatDetails(undefined)).toBe('')
  })
})
