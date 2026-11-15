import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TemporaryPasswordDialog } from './TemporaryPasswordDialog'

const PASSWORD = 'Kp7#vR2q-Lm9x'

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}

beforeEach(() => stubClipboard(() => Promise.resolve()))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'clipboard')
})

function setup() {
  const onClose = vi.fn()
  render(<TemporaryPasswordDialog login="ivanov.i" password={PASSWORD} onClose={onClose} />)
  return { onClose }
}

const copyButton = () => screen.getByRole('button', { name: 'Скопировать' })

describe('TemporaryPasswordDialog', () => {
  it('uses the 360 sheet spacing of the design: sides 16, body gap 14', () => {
    setup()
    const card = screen.getByRole('alertdialog')
    expect(card.querySelector('.px-4')).toBeTruthy()
    const body = Array.from(card.querySelectorAll('div')).find((el) => el.className.includes('pb-2'))
    expect(body?.className).toContain('px-4')
    expect(body?.className).toContain('gap-3.5')
    expect(card.querySelector('h2')?.parentElement?.className).toContain('px-4')
  })

  it('is an alertdialog "Сотрудник создан" with the instruction', () => {
    setup()
    expect(screen.getByRole('alertdialog', { name: 'Сотрудник создан' })).toBeTruthy()
    expect(screen.getByText('Передайте сотруднику логин и временный пароль. При первом входе портал попросит сменить пароль')).toBeTruthy()
  })

  it('shows the login and the password', () => {
    setup()
    expect(screen.getByText('ivanov.i')).toBeTruthy()
    expect(screen.getByText(PASSWORD)).toBeTruthy()
    expect(screen.getByText('Логин')).toBeTruthy()
    expect(screen.getByText('Временный пароль')).toBeTruthy()
  })

  it('warns that the password is shown once', () => {
    setup()
    expect(within(screen.getByRole('status')).getByText('Пароль показывается один раз. После закрытия окна его нельзя будет посмотреть снова')).toBeTruthy()
  })

  it('has no close cross, only "Готово, пароль сохранён"', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Закрыть' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Готово, пароль сохранён' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Отмена' })).toBeNull()
  })

  it('puts the focus on "Скопировать"', () => {
    setup()
    expect(document.activeElement).toBe(copyButton())
  })

  it('does not close on Esc', () => {
    const { onClose } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(PASSWORD)).toBeTruthy()
  })

  it('does not close on a click on the backdrop', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByTestId('dialog-backdrop'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(PASSWORD)).toBeTruthy()
  })

  it('copies the password and shows "Скопировано", then returns to "Скопировать" after 2 s', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(() => Promise.resolve())
    stubClipboard(writeText)
    setup()
    await act(async () => {
      fireEvent.click(copyButton())
    })
    expect(writeText).toHaveBeenCalledWith(PASSWORD)
    expect(screen.getByRole('button', { name: 'Скопировано' })).toBeTruthy()
    expect(screen.queryByText(/Не удалось скопировать/)).toBeNull()
    act(() => vi.advanceTimersByTime(1999))
    expect(screen.getByRole('button', { name: 'Скопировано' })).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('button', { name: 'Скопировать' })).toBeTruthy()
  })

  it('announces the copy through a polite live region', async () => {
    setup()
    await act(async () => {
      fireEvent.click(copyButton())
    })
    const live = document.querySelector('[aria-live="polite"]')
    expect(live?.textContent).toContain('Скопировано')
  })

  it('when the clipboard rejects shows how to copy by hand and keeps the password selectable', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')))
    setup()
    await act(async () => {
      fireEvent.click(copyButton())
    })
    expect(screen.getByText('Не удалось скопировать. Выделите пароль и скопируйте вручную')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Скопировано' })).toBeNull()
    expect(screen.getByText(PASSWORD).className).toContain('select-all')
  })

  it('when there is no clipboard at all shows the same hint', async () => {
    Reflect.deleteProperty(navigator, 'clipboard')
    setup()
    await act(async () => {
      fireEvent.click(copyButton())
    })
    expect(screen.getByText('Не удалось скопировать. Выделите пароль и скопируйте вручную')).toBeTruthy()
  })

  it('"Готово, пароль сохранён" calls onClose', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Готово, пароль сохранён' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('after closing the password is nowhere in the document', () => {
    function Harness() {
      const [password, setPassword] = useState<string | null>(PASSWORD)
      return password ? <TemporaryPasswordDialog login="ivanov.i" password={password} onClose={() => setPassword(null)} /> : null
    }
    render(<Harness />)
    expect(screen.getByText(PASSWORD)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Готово, пароль сохранён' }))
    expect(screen.queryByText(PASSWORD)).toBeNull()
    expect(document.body.textContent).not.toContain(PASSWORD)
  })

  it('drops the password by itself once it has been closed, even if the parent keeps rendering it', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Готово, пароль сохранён' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toContain(PASSWORD)
  })

  it('asks the browser to confirm leaving while it is open (beforeunload)', () => {
    setup()
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('stops asking after it was closed', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Готово, пароль сохранён' }))
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('stops asking after it was unmounted', () => {
    const view = render(<TemporaryPasswordDialog login="a" password={PASSWORD} onClose={() => undefined} />)
    view.unmount()
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
