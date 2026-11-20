import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from './Toast'

type Api = ReturnType<typeof useToast>
const ref: { api: Api | null } = { api: null }
const getApi = (): Api => {
  if (!ref.api) throw new Error('no api')
  return ref.api
}

function Probe() {
  const value = useToast()
  useEffect(() => {
    ref.api = value
  })
  return null
}

function setup() {
  render(
    <ToastProvider>
      <Probe />
    </ToastProvider>,
  )
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides a success toast by itself', async () => {
    setup()
    act(() => {
      getApi().show({ tone: 'success', title: 'Сохранено' })
    })
    expect(await screen.findByText('Сохранено')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(screen.queryByText('Сохранено')).toBeNull()
  })

  it('keeps a persistent error with Retry until dismissed', async () => {
    setup()
    const onClick = vi.fn()
    act(() => {
      getApi().show({
        tone: 'error',
        title: 'Не удалось переименовать',
        persistent: true,
        action: { label: 'Повторить', onClick },
      })
    })
    expect(await screen.findByText('Не удалось переименовать')).toBeTruthy()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(screen.getByText('Не удалось переименовать')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onClick).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(screen.queryByText('Не удалось переименовать')).toBeNull()
  })

  it('uses polite live region for success and assertive for error', async () => {
    setup()
    act(() => {
      getApi().show({ tone: 'success', title: 'Готово' })
      getApi().show({ tone: 'error', title: 'Ошибка', persistent: true })
    })
    const ok = (await screen.findByText('Готово')).closest('[data-tone]')
    const bad = screen.getByText('Ошибка').closest('[data-tone]')
    expect(ok?.getAttribute('aria-live')).toBe('polite')
    expect(bad?.getAttribute('aria-live')).toBe('assertive')
  })

  it('shows at most three toasts at once', async () => {
    setup()
    act(() => {
      for (const n of [1, 2, 3, 4]) getApi().show({ tone: 'error', title: `Т${String(n)}`, persistent: true })
    })
    await screen.findByText('Т4')
    expect(screen.queryByText('Т1')).toBeNull()
    expect(screen.getAllByText(/^Т\d$/)).toHaveLength(3)
  })

  it('dismiss removes a toast by id', async () => {
    setup()
    let id = ''
    act(() => {
      id = getApi().show({ tone: 'error', title: 'Сбой', persistent: true })
    })
    await screen.findByText('Сбой')
    act(() => {
      getApi().dismiss(id)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(screen.queryByText('Сбой')).toBeNull()
  })
})
