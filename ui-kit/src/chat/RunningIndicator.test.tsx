import { AssistantRuntimeProvider, useAui, useLocalRuntime } from '@assistant-ui/react'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { RunningIndicator } from './RunningIndicator'

let release: () => void = () => undefined
const slow: ChatModelAdapter = {
  async *run() {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    yield { content: [{ type: 'text', text: 'ok' }] }
  },
}

function Harness({ serverRunning, send }: { serverRunning: boolean; send: boolean }) {
  const runtime = useLocalRuntime(slow)
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {send && <Sender />}
      <RunningIndicator serverRunning={serverRunning} />
    </AssistantRuntimeProvider>
  )
}

function Sender() {
  const aui = useAui()
  useEffect(() => {
    aui.thread.append('вопрос')
  }, [aui])
  return null
}

describe('RunningIndicator', () => {
  it('is hidden while nothing runs', () => {
    render(<Harness serverRunning={false} send={false} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows while the local run goes (thread.isRunning)', async () => {
    render(<Harness serverRunning={false} send />)
    expect((await screen.findByRole('status')).textContent).toContain('Агент отвечает')
    release()
  })

  it('shows when the server still runs the agent (serverRunning)', () => {
    render(<Harness serverRunning send={false} />)
    expect(screen.getByRole('status').textContent).toContain('Агент ещё отвечает')
  })
})
