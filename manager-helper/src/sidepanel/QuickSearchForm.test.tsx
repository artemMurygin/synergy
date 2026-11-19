import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuickSearchForm } from './QuickSearchForm'

function setup(props: Partial<Parameters<typeof QuickSearchForm>[0]> = {}) {
  const onSubmit = vi.fn()
  const onToggle = vi.fn()
  render(<QuickSearchForm open pending={false} onToggle={onToggle} onSubmit={onSubmit} {...props} />)
  return { onSubmit, onToggle }
}

describe('QuickSearchForm', () => {
  it('toggles on the header and stays closed without the fields', () => {
    const { onToggle } = setup({ open: false })
    expect(screen.queryByRole('button', { name: 'Начать подбор' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Быстрый подбор/ }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('blocks the header and the submit while a run is going', () => {
    setup({ pending: true })
    expect(screen.getByRole('button', { name: /Быстрый подбор/ }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Начать подбор' }).hasAttribute('disabled')).toBe(true)
  })

  it('picks options in segmented groups', () => {
    setup()
    expect(screen.getByRole('radio', { name: 'Образование' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'Магистратура' }))
    expect(screen.getByRole('radio', { name: 'Магистратура' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Любой' }).getAttribute('aria-checked')).toBe('false')
  })

  it('submits the query and a short title built from the parameters', () => {
    const { onSubmit } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'MBA и программы для руководителей' }))
    fireEvent.click(screen.getByRole('button', { name: 'Начать подбор' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('MBA'),
      expect.stringContaining('MBA'),
    )
  })

  it('switches to courses with topic tags and a free topic field', () => {
    const { onSubmit } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Курсы и ДПО' }))
    fireEvent.change(screen.getByPlaceholderText('Своя тема'), { target: { value: 'охрана труда' } })
    fireEvent.click(screen.getByRole('button', { name: 'Начать подбор' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.stringContaining('охрана труда'), expect.any(String))
  })

  it('toggles the state support switch where the level allows it', () => {
    setup()
    const toggle = screen.getByRole('switch', { name: 'Только с господдержкой' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'MBA и программы для руководителей' }))
    expect(screen.queryByRole('switch', { name: 'Только с господдержкой' })).toBeNull()
  })
})
