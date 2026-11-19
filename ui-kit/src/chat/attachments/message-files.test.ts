import { describe, expect, it } from 'vitest'
import { messageFiles, messageSource } from './message-files'

const stored = {
  id: 'f1',
  name: 'a.pdf',
  mediaType: 'application/pdf',
  kind: 'document',
  sizeBytes: 10,
  status: 'active',
}

describe('messageFiles', () => {
  it('reads the files saved with the message', () => {
    expect(messageFiles({ content: [], metadata: { custom: { attachments: [stored] } } })).toEqual([stored])
  })

  it('reads the files attached during the stream and drops duplicates', () => {
    const files = messageFiles({
      content: [
        { type: 'data', name: 'file-attached', data: { id: 'f1', name: 'a.pdf', mediaType: 'application/pdf', size: 10, kind: 'document' } },
        { type: 'data', name: 'other', data: {} },
      ],
      metadata: { custom: { attachments: [stored, { broken: true }] } },
    })
    expect(files).toEqual([stored])
  })
})

describe('messageSource', () => {
  it('is system only for a server-posted message', () => {
    expect(messageSource({ content: [], metadata: { custom: { source: 'system' } } })).toBe('system')
    expect(messageSource({ content: [] })).toBe('run')
  })
})
