import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MobileSearchBar } from './MobileSearchBar'

function setup(value = 'счёт-фактура') {
  const onChange = vi.fn()
  const onBack = vi.fn()
  render(<MobileSearchBar value={value} onChange={onChange} onBack={onBack} />)
  return { onChange, onBack }
}

describe('MobileSearchBar', () => {
  it('показывает запрос и отдаёт ввод', async () => {
    const { onChange } = setup('')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск по названию' }), 'а')
    expect(onChange).toHaveBeenCalledWith('а')
  })

  it('«Очистить» очищает поле, но не закрывает поиск', async () => {
    const { onChange, onBack } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Очистить' }))
    expect(onChange).toHaveBeenCalledWith('')
    expect(onBack).not.toHaveBeenCalled()
  })

  it('«Назад» закрывает и очищает', async () => {
    const { onChange, onBack } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
    expect(onChange).toHaveBeenCalledWith('')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('кнопки «Очистить» нет при пустом поле', () => {
    setup('')
    expect(screen.queryByRole('button', { name: 'Очистить' })).toBeNull()
  })
})
