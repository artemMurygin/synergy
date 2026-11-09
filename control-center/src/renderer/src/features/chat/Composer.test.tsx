import './test-env'
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Composer } from './Composer'

afterEach(cleanup)

function Host({ children, run }: { children: ReactNode; run: () => void }) {
  const runtime = useLocalRuntime({
    run: async function* () {
      run()
      yield { content: [{ type: 'text' as const, text: 'ok' }] }
    }
  })
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}

function setup(props: Partial<Parameters<typeof Composer>[0]> = {}) {
  const run = vi.fn()
  const onStop = vi.fn()
  render(
    <Host run={run}>
      <Composer running={false} disabled={false} onStop={onStop} {...props} />
    </Host>
  )
  return { run, onStop, user: userEvent.setup() }
}

describe('Composer', () => {
  it('does not send an empty or blank message', async () => {
    const { run, user } = setup()
    const send = screen.getByRole('button', { name: 'Спросить' })
    expect((send as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByPlaceholderText('Вопрос агенту'), '   {Enter}')
    expect(run).not.toHaveBeenCalled()
  })

  it('sends the question on Enter and clears the field', async () => {
    const { run, user } = setup()
    const input = screen.getByPlaceholderText('Вопрос агенту') as HTMLTextAreaElement
    await user.type(input, 'сколько стоит{Enter}')
    expect(run).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('')
  })

  it('shows "Остановить" instead of send while the agent answers', async () => {
    const { onStop, user } = setup({ running: true })
    expect(screen.queryByRole('button', { name: 'Спросить' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Остановить' }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('keeps a draft typed during the run when the run state changes', async () => {
    const { user } = setup({ running: true })
    const input = screen.getByPlaceholderText('Вопрос агенту') as HTMLTextAreaElement
    await user.type(input, 'черновик')
    expect(input.value).toBe('черновик')
  })

  it('blocks the field when disabled', () => {
    setup({ disabled: true })
    expect((screen.getByPlaceholderText('Вопрос агенту') as HTMLTextAreaElement).disabled).toBe(true)
  })
})
