import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PanelHeader, PanelHeaderButton } from './PanelHeader'

describe('PanelHeader', () => {
  it('renders title and meta in a capsule and actions in another', () => {
    render(
      <PanelHeader title="Цены на MBA" meta="Сегодня, 14:32" actions={<button type="button">Действие</button>} />,
    )
    expect(screen.getByRole('heading', { name: /Цены на MBA/ })).toBeTruthy()
    expect(screen.getByText('Сегодня, 14:32')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Действие' })).toBeTruthy()
  })

  it('renders a round labelled button that handles clicks', async () => {
    const onClick = vi.fn()
    render(<PanelHeaderButton label="Поиск" icon={<svg />} onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Поиск' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
