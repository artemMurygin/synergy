import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Markdown } from './markdown'

afterEach(cleanup)

describe('Markdown', () => {
  it('рендерит заголовки, списки, цитаты', () => {
    const { container } = render(<Markdown>{'# Заголовок\n\n## Под\n\n1. один\n2. два\n\n- a\n- b\n\n> цитата'}</Markdown>)
    expect(screen.getByRole('heading', { level: 1, name: 'Заголовок' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Под' })).toBeTruthy()
    expect(container.querySelectorAll('ol li')).toHaveLength(2)
    expect(container.querySelectorAll('ul li')).toHaveLength(2)
    expect(container.querySelector('blockquote')?.textContent).toContain('цитата')
  })

  it('рендерит таблицу GFM', () => {
    render(<Markdown>{'| Команда | Что |\n|---|---|\n| /акт | сверка |'}</Markdown>)
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Команда' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: '/акт' })).toBeTruthy()
  })

  it('инлайн-код и блок кода используют font-mono', () => {
    const { container } = render(<Markdown>{'Команда `/акт`\n\n```\nстрока 1\nстрока 2\n```'}</Markdown>)
    const inline = screen.getByText('/акт')
    expect(inline.className).toContain('font-mono')
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre!.className).toContain('font-mono')
    expect(pre?.textContent).toContain('строка 1')
  })

  it('рендерит изображение', () => {
    render(<Markdown>{'![схема](/img/a.png)'}</Markdown>)
    expect(screen.getByRole('img', { name: 'схема' }).getAttribute('src')).toBe('/img/a.png')
  })

  it('<script> и <b> показываются текстом и не исполняются', () => {
    const { container } = render(<Markdown>{'<script>alert(1)</script> <b>жирный</b>'}</Markdown>)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container?.textContent).toContain('<script>alert(1)</script>')
    expect(container?.textContent).toContain('<b>жирный</b>')
  })

  it('внешние ссылки открываются в новой вкладке с noopener noreferrer', () => {
    render(<Markdown>{'[сайт](https://example.com)'}</Markdown>)
    const a = screen.getByRole('link', { name: /сайт/ })
    expect(a.getAttribute('href')).toBe('https://example.com')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('пропускает mailto и относительные ссылки', () => {
    render(<Markdown>{'[почта](mailto:a@b.ru) [отдел](/catalog)'}</Markdown>)
    expect(screen.getByRole('link', { name: /почта/ }).getAttribute('href')).toBe('mailto:a@b.ru')
    expect(screen.getByRole('link', { name: /отдел/ }).getAttribute('href')).toBe('/catalog')
  })

  it.each(['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd'])(
    'небезопасная схема %s не даёт ссылку',
    (url) => {
      const { container } = render(<Markdown>{`[клик](${url})`}</Markdown>)
      expect(screen.queryByRole('link')).toBeNull()
      expect(container.querySelector('a')).toBeNull()
      expect(container?.textContent).toContain('клик')
      expect(container.innerHTML).not.toContain(url)
    }
  )

  it('ссылка с пустым href рендерится span', () => {
    const { container } = render(<Markdown>{'[пусто]()'}</Markdown>)
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('span')?.textContent).toContain('пусто')
  })
})
