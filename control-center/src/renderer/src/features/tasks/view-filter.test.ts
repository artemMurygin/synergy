import { describe, expect, it } from 'vitest'
import { viewToFilter } from './view-filter'

describe('viewToFilter', () => {
  it('all: no restriction', () => {
    expect(viewToFilter('all', 'u1')).toEqual({})
  })
  it('mine: current user is the assignee', () => {
    expect(viewToFilter('mine', 'u1')).toEqual({ assigneeId: 'u1' })
  })
  it('watching: current user is a watcher', () => {
    expect(viewToFilter('watching', 'u1')).toEqual({ watcherId: 'u1' })
  })
  it('created: current user is the creator', () => {
    expect(viewToFilter('created', 'u1')).toEqual({ creatorId: 'u1' })
  })
  it('overdue: overdue flag only', () => {
    expect(viewToFilter('overdue', 'u1')).toEqual({ overdue: true })
  })
  it('uses the given user id', () => {
    expect(viewToFilter('mine', 'u2')).toEqual({ assigneeId: 'u2' })
  })
})
