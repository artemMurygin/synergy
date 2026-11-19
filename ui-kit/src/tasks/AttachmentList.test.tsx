import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AttachmentList, type AttachmentListProps } from './AttachmentList'
import { makeDetails } from './fixtures'

function setup(over: Partial<AttachmentListProps> = {}) {
  const props: AttachmentListProps = {
    attachments: makeDetails().attachments,
    onUpload: vi.fn(() => Promise.resolve()),
    onDelete: vi.fn(() => Promise.resolve()),
    onDownload: vi.fn(() => Promise.resolve()),
    ...over,
  }
  render(<AttachmentList {...props} />)
  return props
}

const file = (name: string, size = 10, type = 'application/pdf') => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('AttachmentList', () => {
  it('показывает имя и размер файлов', () => {
    setup()
    expect(screen.getByText('КП_МВА.pdf')).toBeTruthy()
    expect(screen.getByText('1,4 МБ')).toBeTruthy()
    expect(screen.getByText(/Вложения · 2/)).toBeTruthy()
  })

  it('скачивание', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Скачать: КП_МВА.pdf' }))
    expect(props.onDownload).toHaveBeenCalledWith(props.attachments[0])
  })

  it('удаление только после подтверждения', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Удалить вложение: КП_МВА.pdf' }))
    expect(props.onDelete).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(props.onDelete).toHaveBeenCalledWith(props.attachments[0])
  })

  it('отмена подтверждения не удаляет', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Удалить вложение: КП_МВА.pdf' }))
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(props.onDelete).not.toHaveBeenCalled()
  })

  it('canDelete скрывает удаление чужих файлов', () => {
    setup({ canDelete: (a) => a.uploadedBy === 'u1' })
    expect(screen.getByRole('button', { name: 'Удалить вложение: КП_МВА.pdf' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Удалить вложение: Расчёт.xlsx' })).toBeNull()
  })

  it('загрузка с прогрессом', async () => {
    let report: (value: number) => void = () => undefined
    let finish: () => void = () => undefined
    const onUpload = vi.fn(
      (_file: File, opts: { onProgress: (v: number) => void }) =>
        new Promise<void>((resolve) => {
          report = opts.onProgress
          finish = resolve
        }),
    )
    setup({ onUpload })
    await userEvent.upload(screen.getByLabelText('Выбрать файлы'), file('new.pdf'))
    const bar = await screen.findByRole('progressbar', { name: /new\.pdf/ })
    act(() => {
      report(0.5)
    })
    expect(bar.getAttribute('aria-valuenow')).toBe('50')
    act(() => {
      finish()
    })
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).toBeNull()
    })
  })

  it('слишком большой файл не загружается', async () => {
    const props = setup({ maxBytes: 100 })
    await userEvent.upload(screen.getByLabelText('Выбрать файлы'), file('big.pdf', 500))
    expect(props.onUpload).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('Файл слишком большой')
  })

  it('неподдерживаемый тип не загружается', async () => {
    const props = setup({ isTypeAllowed: (f) => f.name.endsWith('.pdf') })
    await userEvent.upload(screen.getByLabelText('Выбрать файлы'), file('run.exe', 10, 'application/x-msdownload'), { applyAccept: false })
    expect(props.onUpload).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('тип файла не поддерживается')
  })

  it('ошибка загрузки показывает сообщение', async () => {
    setup({ onUpload: () => Promise.reject(new Error('Сервер недоступен')) })
    await userEvent.upload(screen.getByLabelText('Выбрать файлы'), file('a.pdf'))
    expect((await screen.findByRole('alert')).textContent).toContain('Сервер недоступен')
  })

  it('лимит числа файлов', async () => {
    const props = setup({ maxFiles: 2 })
    await userEvent.upload(screen.getByLabelText('Выбрать файлы'), file('a.pdf'))
    expect(props.onUpload).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('лимит')
  })
})
