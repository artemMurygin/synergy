import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

const options = [
  { value: 'all', label: 'Все' },
  { value: 'mine', label: 'Мои' },
  { value: 'done', label: 'Готово' },
]

function Harness({ trailing }: { trailing?: React.ReactNode }) {
  const [value, setValue] = useState('all')
  return (
    <SegmentedControl
      aria-label="Вид"
      options={options}
      value={value}
      onValueChange={setValue}
      trailing={trailing}
    />
  )
}

describe('SegmentedControl', () => {
  it('exposes a radiogroup with the selected radio checked', () => {
    render(<Harness />)
    expect(screen.getByRole('radiogroup', { name: 'Вид' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Все' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Мои' }).getAttribute('aria-checked')).toBe('false')
  })

  it('moves selection with arrow keys, wrapping around', async () => {
    render(<Harness />)
    screen.getByRole('radio', { name: 'Все' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Мои' }).getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Мои' }))
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Готово' }).getAttribute('aria-checked')).toBe('true')
  })

  it('selects on click and uses roving tabindex', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('radio', { name: 'Мои' }))
    expect(screen.getByRole('radio', { name: 'Мои' }).getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('radio', { name: 'Все' }).getAttribute('tabindex')).toBe('-1')
  })

  it('renders the trailing slot for the "Ещё" menu item', () => {
    render(<Harness trailing={<button type="button">Ещё</button>} />)
    expect(screen.getByRole('button', { name: 'Ещё' })).toBeTruthy()
  })
})
