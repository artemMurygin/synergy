import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MessageFile } from './file-upload-port'
import { MessageAttachments } from './MessageAttachments'

const file = (id: string, status: MessageFile['status'] = 'active'): MessageFile => ({
  id,
  name: `${id}.pdf`,
  mediaType: 'application/pdf',
  kind: 'document',
  sizeBytes: 1024,
  status,
})

describe('MessageAttachments', () => {
  it('renders nothing without files', () => {
    const { container } = render(<MessageAttachments files={[]} onDownload={() => undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('downloads a file through onDownload', async () => {
    const onDownload = vi.fn()
    render(<MessageAttachments files={[file('a'), file('b')]} onDownload={onDownload} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Скачать b.pdf' }))
    expect(onDownload).toHaveBeenCalledWith(file('b'))
  })

  it('marks an expired file and disables its download', () => {
    render(<MessageAttachments files={[file('a', 'deleted')]} onDownload={() => undefined} />)
    expect(screen.getByText('Срок хранения истёк')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('does not start a download of a file that is being downloaded', async () => {
    const onDownload = vi.fn()
    render(<MessageAttachments files={[file('a')]} pending={new Set(['a'])} onDownload={onDownload} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Скачать a.pdf' }))
    expect(onDownload).not.toHaveBeenCalled()
  })
})
