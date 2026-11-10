import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MarkdownText } from './MarkdownText'

afterEach(cleanup)

describe('MarkdownText', () => {
  it('renders headings, emphasis, lists and inline code', () => {
    const { container } = render(
      <MarkdownText text={'## Программы\n\n**Очно** и *заочно*:\n\n- Дизайн\n- Психология\n\n1. Шаг\n2. Шаг\n\nКод `npm test`'} />
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Программы' })).toBeTruthy()
    expect(container.querySelector('strong')?.textContent).toBe('Очно')
    expect(container.querySelector('em')?.textContent).toBe('заочно')
    expect(container.querySelectorAll('ul > li')).toHaveLength(2)
    expect(container.querySelectorAll('ol > li')).toHaveLength(2)
    expect(container.querySelector('code')?.textContent).toBe('npm test')
  })

  it('renders GFM tables', () => {
    render(<MarkdownText text={'| Программа | Цена |\n| --- | --- |\n| Дизайн | 100 000 ₽ |'} />)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Цена' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: '100 000 ₽' })).toBeTruthy()
  })

  it('opens links in the system browser', () => {
    render(<MarkdownText text={'[Сайт](https://synergy.ru)'} />)
    const link = screen.getByRole('link', { name: 'Сайт' })
    expect(link.getAttribute('href')).toBe('https://synergy.ru')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noreferrer')
  })

  it('does not render raw HTML or unsafe links', () => {
    const { container } = render(<MarkdownText text={'<b>жирный</b> [x](javascript:alert(1))'} />)
    expect(container.querySelector('b')).toBeNull()
    // the javascript: URL is stripped, so the anchor has no usable href
    expect(screen.getByText('x').closest('a')?.getAttribute('href') ?? '').toBe('')
  })
})
