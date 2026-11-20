import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutModeProvider } from '../layout/layout-mode'
import { DeadlineField, DeadlinePicker } from './DeadlinePicker'

const NOW = new Date('2026-11-19T12:00:00')

function panel(value: Date | null = null) {
  const onChange = vi.fn()
  const onClose = vi.fn()
  render(<DeadlinePicker value={value} onChange={onChange} onClose={onClose} now={NOW} />)
  return { onChange, onClose }
}

describe('DeadlinePicker', () => {
  it('«Завтра» без времени ставит 18:00, «Готово» сохраняет', async () => {
    const { onChange, onClose } = panel()
    await userEvent.click(screen.getByRole('button', { name: 'Завтра' }))
    await userEvent.click(screen.getByRole('button', { name: 'Готово · 20 ноя, 18:00' }))
    expect(onChange).toHaveBeenCalledWith(new Date('2026-11-20T18:00:00'))
    expect(onClose).toHaveBeenCalled()
  })

  it('быстрые даты сохраняют выбранное время', async () => {
    const { onChange } = panel(new Date('2026-12-01T09:30:00'))
    await userEvent.click(screen.getByRole('button', { name: 'Через неделю' }))
    await userEvent.click(screen.getByRole('button', { name: /^Готово/ }))
    expect(onChange).toHaveBeenCalledWith(new Date('2026-11-26T09:30:00'))
  })

  it('поле времени меняет время, день из календаря его сохраняет', async () => {
    const { onChange } = panel(new Date('2026-12-12T18:00:00'))
    fireEvent.change(screen.getByLabelText('Время'), { target: { value: '10:15' } })
    await userEvent.click(screen.getByRole('gridcell', { name: /^14 декабря/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Готово/ }))
    expect(onChange).toHaveBeenCalledWith(new Date('2026-12-14T10:15:00'))
  })

  it('«Без срока» очищает значение', async () => {
    const { onChange, onClose } = panel(new Date('2026-12-12T18:00:00'))
    await userEvent.click(screen.getByRole('button', { name: 'Без срока' }))
    expect(onChange).toHaveBeenCalledWith(null)
    expect(onClose).toHaveBeenCalled()
  })

  it('закрытие без «Готово» не меняет значение', async () => {
    const { onChange } = panel(new Date('2026-12-12T18:00:00'))
    await userEvent.click(screen.getByRole('button', { name: 'Завтра' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('подпись «Готово · 12 дек, 18:00» по текущему значению', () => {
    panel(new Date('2026-12-12T18:00:00'))
    expect(screen.getByRole('button', { name: 'Готово · 12 дек, 18:00' })).toBeTruthy()
  })
})

describe('DeadlineField', () => {
  function field(mode: 'desktop' | 'mobile', onChange = vi.fn()) {
    render(
      <LayoutModeProvider mode={mode}>
        <DeadlineField value={null} onChange={onChange} label="Дедлайн" now={NOW} />
      </LayoutModeProvider>,
    )
    return onChange
  }

  it('на desktop открывается всплывающим окном', async () => {
    field('desktop')
    await userEvent.click(screen.getByRole('button', { name: 'Дедлайн' }))
    expect(await screen.findByRole('button', { name: 'Завтра' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Дедлайн' })).toBeNull()
  })

  it('на mobile открывается в Sheet', async () => {
    const onChange = field('mobile')
    await userEvent.click(screen.getByRole('button', { name: 'Дедлайн' }))
    const dialog = await screen.findByRole('dialog', { name: 'Дедлайн' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Завтра' }))
    await userEvent.click(within(dialog).getByRole('button', { name: /^Готово/ }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
