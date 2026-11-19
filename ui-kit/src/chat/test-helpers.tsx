import { AssistantRuntimeProvider, useAui, useLocalRuntime } from '@assistant-ui/react'
import type { AssistantRuntime, ChatModelAdapter } from '@assistant-ui/react'
import { useEffect, useRef, type ReactNode } from 'react'
import type { FileUploadPort } from './attachments/file-upload-port'

/** Upload port that never settles by itself: tests resolve the pending uploads. */
export function fakePort() {
  const uploads: { file: File; resolve: (fileId: string) => void }[] = []
  const port: FileUploadPort = {
    upload: (file) =>
      new Promise((resolve) => {
        uploads.push({
          file,
          resolve: (fileId) => {
            resolve({ fileId })
          },
        })
      }),
  }
  return { port, uploads }
}

/** Sends one user message right after mount. */
export function Sender({ text }: { text: string }) {
  const aui = useAui()
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    aui.thread.append(text)
  }, [aui, text])
  return null
}

export function RuntimeHarness({
  adapter,
  onRuntime,
  children,
}: {
  adapter: ChatModelAdapter
  onRuntime?: (runtime: AssistantRuntime) => void
  children: ReactNode
}) {
  const runtime = useLocalRuntime(adapter)
  useEffect(() => {
    onRuntime?.(runtime)
  }, [runtime, onRuntime])
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
