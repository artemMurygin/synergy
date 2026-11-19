import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ComposerAttachments } from './ComposerAttachments'
import type { DraftAttachment } from './use-composer-attachments'

function item(overrides: Partial<DraftAttachment>): DraftAttachment {
  return {
    key: 'k1',
    name: 'отчёт.pdf',
    sizeBytes: 2048,
    mediaType: 'application/pdf',
    kind: 'document',
    status: 'ready',
    progress: 1,
    error: null,
    canRetry: true,
    fileId: 'f1',
    previewUrl: null,
    ...overrides,
  }
}

const handlers = () => ({ onRemove: vi.fn(), onCancel: vi.fn(), onRetry: vi.fn() })

describe('ComposerAttachments', () => {
  it('renders nothing without files', () => {
    const { container } = render(<ComposerAttachments items={[]} {...handlers()} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows a tile with the extension, the name and the size, and removes it', async () => {
    const h = handlers()
    render(<ComposerAttachments items={[item({})]} {...h} />)
    expect(screen.getByText('PDF')).toBeTruthy()
    expect(screen.getByText('отчёт.pdf')).toBeTruthy()
    expect(screen.getByText('2 КБ')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Убрать: отчёт.pdf' }))
    expect(h.onRemove).toHaveBeenCalledWith('k1')
  })

  it('shows a thumbnail for an image', () => {
    render(
      <ComposerAttachments
        items={[item({ name: 'фото.png', mediaType: 'image/png', previewUrl: 'blob:x' })]}
        {...handlers()}
      />,
    )
    expect(screen.getByRole('img', { name: 'фото.png' }).getAttribute('src')).toBe('blob:x')
  })

  it('shows the progress of an upload and cancels it', async () => {
    const h = handlers()
    render(<ComposerAttachments items={[item({ status: 'uploading', progress: 0.4, fileId: null })]} {...h} />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40')
    expect(screen.queryByRole('button', { name: /Убрать/ })).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Отменить загрузку: отчёт.pdf' }))
    expect(h.onCancel).toHaveBeenCalledWith('k1')
  })

  it('shows the reason of a failed upload with retry and remove', async () => {
    const h = handlers()
    render(<ComposerAttachments items={[item({ status: 'error', error: 'Файл больше 50 МБ', fileId: null })]} {...h} />)
    expect(screen.getByText('Файл больше 50 МБ')).toBeTruthy()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Повторить: отчёт.pdf' }))
    expect(h.onRetry).toHaveBeenCalledWith('k1')
    await user.click(screen.getByRole('button', { name: 'Убрать: отчёт.pdf' }))
    expect(h.onRemove).toHaveBeenCalledWith('k1')
  })

  it('offers no retry when the file cannot be picked again', () => {
    render(<ComposerAttachments items={[item({ status: 'error', error: 'Срок хранения файла истёк', canRetry: false })]} {...handlers()} />)
    expect(screen.queryByRole('button', { name: /Повторить/ })).toBeNull()
  })
})
