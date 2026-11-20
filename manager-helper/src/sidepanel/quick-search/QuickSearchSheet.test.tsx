import { LayoutModeProvider } from '@synergy/ui-kit'
import type { LayoutMode } from '@synergy/ui-kit'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { QuickSearchButton } from './QuickSearchButton'
import { DEFAULT_QUICK_SEARCH } from './defaults'
import type { QuickSearchValues } from './defaults'
import { QuickSearchSheet } from './QuickSearchSheet'

function Harness(props: {
  mode?: LayoutMode
  open?: boolean
  pending?: boolean
  onSubmit: (query: string, title: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const [value, setValue] = useState<QuickSearchValues>(DEFAULT_QUICK_SEARCH)
  return (
    <LayoutModeProvider mode={props.mode ?? 'mobile'}>
      <QuickSearchSheet
        open={props.open ?? true}
        value={value}
        onChange={setValue}
        pending={props.pending ?? false}
        onSubmit={props.onSubmit}
        onOpenChange={props.onOpenChange}
      />
    </LayoutModeProvider>
  )
}

describe('QuickSearchButton', () => {
  it('is the "Подбор" pill that opens the sheet', () => {
    const onClick = vi.fn()
    render(<QuickSearchButton onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Подбор' })
    expect(button.className).toContain('bg-brand-red-soft')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when asked to', () => {
    render(<QuickSearchButton onClick={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: 'Подбор' }).hasAttribute('disabled')).toBe(true)
  })
})

describe('QuickSearchSheet', () => {
  it('renders nothing while closed', () => {
    render(<Harness open={false} onSubmit={vi.fn()} onOpenChange={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a bottom sheet on mobile and sits inside the chat column on tablet', () => {
    const { unmount } = render(<Harness mode="mobile" onSubmit={vi.fn()} onOpenChange={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Быстрый подбор' }).closest('[data-quick-search-scrim]')?.className).toContain('fixed')
    unmount()
    render(<Harness mode="tablet" onSubmit={vi.fn()} onOpenChange={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Быстрый подбор' }).closest('[data-quick-search-scrim]')?.className).toContain('absolute')
  })

  it('closes the sheet and passes the query and the title on submit', () => {
    const onSubmit = vi.fn()
    const onOpenChange = vi.fn()
    render(<Harness onSubmit={onSubmit} onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Отправить в чат' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onSubmit).toHaveBeenCalledWith(expect.stringContaining('Подбери'), 'Подбор программ')
  })

  it('does not submit while the agent answers', () => {
    const onSubmit = vi.fn()
    render(<Harness pending onSubmit={onSubmit} onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Отправить в чат' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('closes with the close button, the scrim and Escape', () => {
    const onOpenChange = vi.fn()
    render(<Harness onSubmit={vi.fn()} onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    const scrim = document.querySelector('[data-quick-search-scrim]')
    if (scrim === null) throw new Error('no scrim')
    fireEvent.click(scrim)
    expect(onOpenChange).toHaveBeenCalledTimes(3)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
