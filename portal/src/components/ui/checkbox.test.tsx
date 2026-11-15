import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Checkbox } from './checkbox'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

function describedBy(el: HTMLElement): string {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
}

describe('Checkbox', () => {
  it('is exposed as a checkbox named by its label and described by its description', () => {
    render(<Checkbox label="Разработчик" description="очередь заявок и навыки" checked={false} onCheckedChange={() => {}} />)
    const box = screen.getByRole('checkbox', { name: 'Разработчик' })
    expect(describedBy(box)).toBe('очередь заявок и навыки')
    expect(box.tagName).toBe('INPUT')
    expect((box as HTMLInputElement).type).toBe('checkbox')
    expect((box as HTMLInputElement).checked).toBe(false)
  })

  it('reflects the checked state', () => {
    render(<Checkbox label="Администратор" checked onCheckedChange={() => {}} />)
    expect((screen.getByRole('checkbox', { name: 'Администратор' }) as HTMLInputElement).checked).toBe(true)
  })

  it('toggles on click of the box or the label', async () => {
    const onChange = vi.fn()
    render(<Checkbox label="Разработчик" checked={false} onCheckedChange={onChange} />)
    await userEvent.click(screen.getByText('Разработчик'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('toggles with Space and is reachable with Tab', async () => {
    const onChange = vi.fn()
    render(<Checkbox label="Разработчик" checked onCheckedChange={onChange} />)
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('checkbox'))
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('does nothing when disabled', async () => {
    const onChange = vi.fn()
    render(<Checkbox label="Разработчик" checked={false} disabled onCheckedChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('takes part in a form: submits with its name and value only when checked', () => {
    const { container, rerender } = render(
      <form>
        <Checkbox label="Разработчик" name="role" value="developer" checked={false} onCheckedChange={() => {}} />
      </form>
    )
    const form = container.querySelector('form') as HTMLFormElement
    expect(new FormData(form).getAll('role')).toEqual([])
    rerender(
      <form>
        <Checkbox label="Разработчик" name="role" value="developer" checked onCheckedChange={() => {}} />
      </form>
    )
    expect(new FormData(form).getAll('role')).toEqual(['developer'])
  })
})
