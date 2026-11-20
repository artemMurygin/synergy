import type { ChatModelAdapter } from '@assistant-ui/react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThreadActionsContext } from './thread-context'
import type * as VoiceModule from './voice/use-voice-input'
import type { VoiceInput } from './voice/use-voice-input'
import type { VoiceTranscriptionPort } from './voice/types'
import { must } from '../test-utils'
import { Composer } from './Composer'
import { VoiceError } from './voice/types'
import { useComposerAttachments } from './attachments/use-composer-attachments'
import { RuntimeHarness, fakePort } from './test-helpers'

type VoiceMock = { override: VoiceInput | null; onTranscript: ((text: string) => void) | undefined }

const voiceMock = vi.hoisted((): VoiceMock => ({ override: null, onTranscript: undefined }))

vi.mock('./voice/use-voice-input', async (importOriginal) => {
  const actual = await importOriginal<typeof VoiceModule>()
  return {
    ...actual,
    useVoiceInput: (port: VoiceTranscriptionPort | undefined, onTranscript?: (text: string) => void) => {
      voiceMock.onTranscript = onTranscript
      const real = actual.useVoiceInput(port, onTranscript)
      return voiceMock.override ?? real
    },
  }
})

const calls: { text: string; runConfig: unknown }[] = []
const adapter: ChatModelAdapter = {
  async *run({ messages, runConfig }) {
    await Promise.resolve()
    const last = messages.at(-1)
    const part = last?.content.at(0)
    calls.push({ text: part?.type === 'text' ? part.text : '', runConfig })
    yield { content: [{ type: 'text', text: 'ok' }] }
  },
}

function Subject({
  port,
  disabled,
  voice,
  tools,
}: {
  port: ReturnType<typeof fakePort>['port']
  disabled?: boolean
  voice?: VoiceTranscriptionPort
  tools?: React.ReactNode
}) {
  const attachments = useComposerAttachments(port)
  return <Composer attachments={attachments} disabled={disabled} voice={voice} tools={tools} />
}

function setup(disabled?: boolean) {
  calls.length = 0
  const fake = fakePort()
  render(
    <RuntimeHarness adapter={adapter}>
      <Subject port={fake.port} disabled={disabled} />
    </RuntimeHarness>,
  )
  return { ...fake, user: userEvent.setup() }
}

describe('Composer', () => {
  it('has the field, the attach button and a round send button with an arrow', () => {
    setup()
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Прикрепить файл' })).toBeTruthy()
    const send = screen.getByRole('button', { name: 'Отправить' })
    expect(send.className).toContain('rounded-full')
    expect(send.querySelector('svg')).not.toBeNull()
  })

  it('has no microphone without a voice port and no "Изменить" buttons', () => {
    setup()
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names.some((n) => /микрофон|голос|Изменить/i.test(n))).toBe(false)
  })

  it('the attach button is a plus', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Прикрепить файл' }).querySelector('svg.lucide-plus')).not.toBeNull()
  })

  it('blocks sending an empty message', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(true)
  })

  it('sends the text with the button and with Enter', async () => {
    const { user } = setup()
    await user.type(screen.getByRole('textbox'), 'первый')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => {
      expect(calls.map((c) => c.text)).toEqual(['первый'])
    })
    await user.type(screen.getByRole('textbox'), 'второй{Enter}')
    await waitFor(() => {
      expect(calls.map((c) => c.text)).toEqual(['первый', 'второй'])
    })
  })

  it('is blocked when disabled', () => {
    setup(true)
    expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Прикрепить файл' }).hasAttribute('disabled')).toBe(true)
  })

  it('attaches picked files, blocks sending while they upload and sends their ids', async () => {
    const { user, uploads } = setup()
    const picker = screen.getByLabelText('Выбрать файлы')
    const file = new File(['x'], 'отчёт.pdf', { type: 'application/pdf' })
    await user.upload(picker, file)
    expect(screen.getByText('отчёт.pdf')).toBeTruthy()
    expect(screen.getByText('Дождитесь загрузки файлов')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(true)
    await act(async () => {
      uploads[0]?.resolve('f1')
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(false)
    })
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => {
      expect(calls).toHaveLength(1)
    })
    expect(calls[0]?.runConfig).toMatchObject({ custom: { fileIds: ['f1'] } })
    expect(screen.queryByText('отчёт.pdf')).toBeNull()
  })

  it('accepts files dropped on the form', () => {
    const { uploads } = setup()
    const file = new File(['x'], 'сводка.xlsx')
    fireEvent.drop(must(screen.getByRole('textbox').closest('form')), {
      dataTransfer: { types: ['Files'], files: [file] },
    })
    expect(uploads.map((u) => u.file.name)).toEqual(['сводка.xlsx'])
  })

  it('removes an attached file with its tile action', async () => {
    const { user, uploads } = setup()
    await user.upload(screen.getByLabelText('Выбрать файлы'), new File(['x'], 'a.pdf'))
    await act(async () => {
      uploads[0]?.resolve('f1')
      await Promise.resolve()
    })
    await user.click(await screen.findByRole('button', { name: 'Убрать: a.pdf' }))
    expect(screen.queryByText('a.pdf')).toBeNull()
  })

  it('shows the limit notice and closes it', async () => {
    const { user } = setup()
    const files = [1, 2, 3, 4, 5, 6].map((n) => new File(['x'], `${String(n)}.pdf`))
    await user.upload(screen.getByLabelText('Выбрать файлы'), files)
    expect(screen.getByRole('alert').textContent).toContain('не больше 5 файлов')
    await user.click(screen.getByRole('button', { name: 'Закрыть сообщение' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

const voicePort: VoiceTranscriptionPort = {
  transcribe: () => Promise.resolve({ kind: 'no-speech' }),
}

function voiceState(patch: Partial<VoiceInput>): VoiceInput {
  return {
    state: 'idle',
    elapsedSec: 0,
    level: 0,
    error: null,
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    cancel: vi.fn(),
    ...patch,
  }
}

function setupVoice(patch: Partial<VoiceInput>, options: { serverRunning?: boolean; tools?: React.ReactNode } = {}) {
  calls.length = 0
  const voice = voiceState(patch)
  voiceMock.override = voice
  const fake = fakePort()
  render(
    <RuntimeHarness adapter={adapter}>
      <ThreadActionsContext.Provider
        value={{ serverRunning: options.serverRunning ?? false, onRetry: () => undefined, onCancel: () => undefined }}
      >
        <Subject port={fake.port} voice={voicePort} tools={options.tools} />
      </ThreadActionsContext.Provider>
    </RuntimeHarness>,
  )
  return { voice, user: userEvent.setup() }
}

describe('Composer: voice and tools slot', () => {
  afterEach(() => {
    voiceMock.override = null
  })

  it('shows the microphone that starts the recording', async () => {
    const { voice, user } = setupVoice({})
    await user.click(screen.getByRole('button', { name: 'Микрофон' }))
    expect(voice.start).toHaveBeenCalledTimes(1)
  })

  it('the microphone is not available while the agent answers', () => {
    setupVoice({}, { serverRunning: true })
    expect(screen.getByRole('button', { name: 'Микрофон' }).hasAttribute('disabled')).toBe(true)
  })

  it('renders the slot of tools next to the plus', () => {
    setupVoice({}, { tools: <button type="button">Подбор</button> })
    expect(screen.getByRole('button', { name: 'Подбор' })).toBeTruthy()
  })

  it('while recording shows the bar instead of the field and the stop button; sending is unavailable', async () => {
    const { voice, user } = setupVoice({ state: 'recording', elapsedSec: 7, level: 0.4 })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('0:07')).toBeTruthy()
    expect(screen.getByText('Говорите…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Остановить запись' }))
    expect(voice.stop).toHaveBeenCalledTimes(1)
  })

  it('while transcribing shows "Распознаю речь…" and blocks sending', () => {
    setupVoice({ state: 'transcribing' })
    expect(screen.getByRole('status').textContent).toContain('Распознаю речь…')
    expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Микрофон' }).hasAttribute('disabled')).toBe(true)
  })

  it('appends the transcript to the typed text with a space and does not send it', async () => {
    const { user } = setupVoice({})
    await user.type(screen.getByRole('textbox'), 'Цены на')
    act(() => {
      voiceMock.onTranscript?.('MBA в Москве')
    })
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('Цены на MBA в Москве')
    expect(calls).toHaveLength(0)
  })

  it('puts the transcript into an empty field as it is', () => {
    setupVoice({})
    act(() => {
      voiceMock.onTranscript?.('сколько стоит MBA')
    })
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('сколько стоит MBA')
  })

  it.each([
    ['microphone-denied', 'Нет доступа к микрофону', 'Повторить'],
    ['no-speech', 'Речь не распознана', 'Записать снова'],
    ['VOICE_TOO_LONG', 'Запись слишком длинная', 'Повторить'],
    ['VOICE_TOO_LARGE', 'Запись слишком длинная', 'Повторить'],
    ['VOICE_PROVIDER_UNAVAILABLE', 'Сервис распознавания недоступен', 'Повторить'],
    ['VOICE_RATE_LIMITED', 'Слишком много запросов', 'Повторить'],
  ] as const)('shows the error %s with the text of the design, keeps the draft and sending', async (code, title, action) => {
    const { voice, user } = setupVoice({ state: 'error', error: new VoiceError(code) })
    expect(screen.getByRole('alert').textContent).toContain(title)
    expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(false)
    await user.type(screen.getByRole('textbox'), 'черновик')
    expect(screen.getByRole('button', { name: 'Отправить' }).hasAttribute('disabled')).toBe(false)
    await user.click(screen.getByRole('button', { name: action }))
    expect(voice.start).toHaveBeenCalledTimes(1)
  })
})
