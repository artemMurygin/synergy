import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FileCard } from './FileCard'
import type { MessageFile } from './file-upload-port'

const docx: MessageFile = {
  id: 'f2',
  name: 'Расшифровка — встреча-12-ноя.docx',
  mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  kind: 'document',
  sizeBytes: 48 * 1024,
  status: 'active',
}

const recording: MessageFile = {
  id: 'f1',
  name: 'встреча-12-ноя.m4a',
  mediaType: 'audio/mp4',
  kind: 'recording',
  sizeBytes: 84 * 1024 * 1024,
  status: 'active',
}

describe('FileCard', () => {
  it('shows the name, the size and a download action', () => {
    render(<FileCard file={docx} onDownload={() => undefined} />)
    expect(screen.getByText('Расшифровка — встреча-12-ноя.docx')).toBeTruthy()
    expect(screen.getByText('48 КБ')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Скачать Расшифровка — встреча-12-ноя.docx' })).toBeTruthy()
  })

  it('shows the extension of the file on the icon', () => {
    const { rerender } = render(<FileCard file={recording} onDownload={() => undefined} />)
    expect(screen.getByText('M4A')).toBeTruthy()
    rerender(<FileCard file={docx} onDownload={() => undefined} />)
    expect(screen.getByText('DOCX')).toBeTruthy()
  })

  it('downloads the file when the row is clicked', async () => {
    const onDownload = vi.fn()
    render(<FileCard file={docx} onDownload={onDownload} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /Скачать/ }))
    expect(onDownload).toHaveBeenCalledWith(docx)
  })

  it('does not start a second download while one runs', async () => {
    const onDownload = vi.fn()
    render(<FileCard file={docx} downloading onDownload={onDownload} />)
    const button = screen.getByRole('button', { name: /Скачать/ })
    expect(button.getAttribute('aria-busy')).toBe('true')
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
