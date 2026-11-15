import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProductAccessLabel } from './ProductAccessLabel'

afterEach(cleanup)

describe('ProductAccessLabel', () => {
  it('lists the departments with commas', () => {
    render(
      <ProductAccessLabel
        departments={[
          { id: 'd1', name: 'КЦ 1' },
          { id: 'd2', name: 'КЦ 2' }
        ]}
      />
    )
    expect(screen.getByText('Доступно: КЦ 1, КЦ 2')).toBeTruthy()
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(<ProductAccessLabel departments={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('wraps a long list instead of breaking the layout', () => {
    render(<ProductAccessLabel departments={[{ id: 'd1', name: 'Отдел контроля качества и сопровождения' }]} />)
    expect(screen.getByText(/Доступно:/).className).toMatch(/break-words|wrap/)
  })
})
