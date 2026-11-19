import { ComposerPrimitive, useAuiState } from '@assistant-ui/react'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutModeProvider, type LayoutMode } from '../layout/layout-mode'
import { RuntimeHarness } from './test-helpers'
import { ThreadWelcome, WELCOME_SUGGESTIONS } from './ThreadWelcome'

const run = vi.fn(() => Promise.resolve({ content: [{ type: 'text' as const, text: 'x' }] }))
const adapter: ChatModelAdapter = { run }

function Draft() {
  const text = useAuiState((s) => s.composer.text)
  return <output aria-label="draft">{text}</output>
}

function mount(mode: LayoutMode) {
  render(
    <LayoutModeProvider mode={mode}>
      <RuntimeHarness adapter={adapter}>
        <ThreadWelcome />
        <ComposerPrimitive.Root>
          <ComposerPrimitive.Input data-chat-composer-input aria-label="Сообщение агенту" />
        </ComposerPrimitive.Root>
        <Draft />
      </RuntimeHarness>
    </LayoutModeProvider>,
  )
  return userEvent.setup()
}

const cards = () => screen.getAllByRole('button').filter((b) => b.getAttribute('data-suggestion') !== null)

describe('ThreadWelcome', () => {
  it('shows four cards on desktop', () => {
    mount('desktop')
    expect(screen.getByRole('heading', { name: 'Чем помочь?' })).toBeTruthy()
    expect(cards()).toHaveLength(4)
  })

  it.each(['tablet', 'mobile'] as const)('shows three cards on %s', (mode) => {
    mount(mode)
    expect(cards()).toHaveLength(3)
  })

  it('puts "title: example" into an empty field, focuses it and sends nothing', async () => {
    const user = mount('desktop')
    const first = WELCOME_SUGGESTIONS[0]
    if (first === undefined) throw new Error('no suggestions')
    await user.click(screen.getByRole('button', { name: new RegExp(first.title) }))
    const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Сообщение агенту' })
    expect(field.value).toBe(`${first.title}: ${first.example}`)
    expect(document.activeElement).toBe(field)
    expect(run).not.toHaveBeenCalled()
  })

  it('leaves the typed text alone', async () => {
    const user = mount('desktop')
    const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Сообщение агенту' })
    await user.type(field, 'мой вопрос')
    const second = WELCOME_SUGGESTIONS[1]
    if (second === undefined) throw new Error('no suggestions')
    await user.click(screen.getByRole('button', { name: new RegExp(second.title) }))
    expect(field.value).toBe('мой вопрос')
  })
})
