import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfirmDialog } from './confirm-dialog'
import { FormField } from './form-field'
import { Pagination } from './pagination'

afterEach(cleanup)

describe('ConfirmDialog · 360 sheet', () => {
  it('has 24/16 sheet padding and a footer with "Отмена" first, stacked, not reversed', () => {
    render(<ConfirmDialog open title="Уволить?" confirmLabel="Уволить" onConfirm={() => {}} onCancel={() => {}} />)
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.className).toContain('px-4')
    expect(dialog.className).toContain('py-6')
    const cancel = screen.getByRole('button', { name: 'Отмена' })
    const confirm = screen.getByRole('button', { name: 'Уволить' })
    expect(cancel.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const footer = cancel.parentElement as HTMLElement
    expect(footer.className).toContain('flex-col')
    expect(footer.className).not.toContain('flex-col-reverse')
    expect(footer.className).toContain('gap-2.5')
  })
})

describe('Pagination · range and live region', () => {
  it('announces the range politely, without a top border', () => {
    render(<Pagination page={1} pageSize={20} total={134} onPageChange={() => {}} />)
    const range = screen.getByText('21–40 из 134', { exact: false })
    expect(range.closest('[aria-live]')?.getAttribute('aria-live')).toBe('polite')
    expect(range.textContent).toContain('21–40 из 134')
    expect(range.querySelector('.hidden.sm\\:inline')?.textContent).toBe('Показано ')
    expect(screen.getByRole('navigation', { name: 'Страницы' }).className).not.toContain('border-t')
  })
})

describe('FormField · label row', () => {
  it('stacks label and hint on narrow screens and puts them in a row from sm', () => {
    render(
      <FormField label="Логин" hint="обязательно" controlId="x" hintId="x-hint">
        <input id="x" />
      </FormField>
    )
    const row = screen.getByText('Логин').parentElement as HTMLElement
    expect(row.className).toContain('flex-col')
    expect(row.className).toContain('sm:flex-row')
  })
})
