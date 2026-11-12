import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileCard } from './FileCard'
import type { MessageFile } from './message-files'

afterEach(cleanup)

const docx: MessageFile = {
  id: 'f2',
  name: 'Расшифровка — встреча-12-ноя.docx',
  mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  kind: 'document',
  sizeBytes: 48 * 1024,
  status: 'active'
}

const recording: MessageFile = {
  id: 'f1',
  name: 'встреча-12-ноя.m4a',
  mediaType: 'audio/mp4',
  kind: 'recording',
  sizeBytes: 84 * 1024 * 1024,
  status: 'active'
}

describe('FileCard', () => {
  it('shows the name, the size and a download action', () => {
    render(<FileCard file={docx} onDownload={() => {}} />)
    expect(screen.getByText('Расшифровка — встреча-12-ноя.docx')).toBeTruthy()
    expect(screen.getByText('48 КБ')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Скачать Расшифровка — встреча-12-ноя.docx' })).toBeTruthy()
  })

  it('uses the recording icon for a recording and the document icon for a document', () => {
    const { container, rerender } = render(<FileCard file={recording} onDownload={() => {}} />)
    expect(container.querySelector('svg.lucide-audio-lines')).not.toBeNull()
    rerender(<FileCard file={docx} onDownload={() => {}} />)
    expect(container.querySelector('svg.lucide-file-text')).not.toBeNull()
  })

  it('downloads the file when the row is clicked', async () => {
    const onDownload = vi.fn()
    render(<FileCard file={docx} onDownload={onDownload} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Скачать/ }))
    expect(onDownload).toHaveBeenCalledWith(docx)
  })

  it('shows a spinner while downloading and does not start a second download', async () => {
    const onDownload = vi.fn()
    const { container } = render(<FileCard file={docx} downloading onDownload={onDownload} />)
    const button = screen.getByRole('button', { name: /Скачать/ })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(container.querySelector('svg.animate-spin')).not.toBeNull()
    await userEvent.setup().click(button)
    expect(onDownload).not.toHaveBeenCalled()
  })

  it('shows an expired file as inactive without an action', async () => {
    const onDownload = vi.fn()
    render(<FileCard file={{ ...docx, status: 'deleted' }} onDownload={onDownload} />)
    expect(screen.getByText('Срок хранения истёк')).toBeTruthy()
    expect(screen.queryByText('48 КБ')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    const row = screen.getByText('Расшифровка — встреча-12-ноя.docx').closest('[aria-disabled]')
    expect(row?.getAttribute('aria-disabled')).toBe('true')
    await userEvent.setup().click(screen.getByText('Расшифровка — встреча-12-ноя.docx'))
    expect(onDownload).not.toHaveBeenCalled()
  })
})
