import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MicPermissionPage } from './MicPermissionPage'

const stop = vi.fn()
const getUserMedia = vi.fn()

beforeEach(() => {
  stop.mockReset()
  getUserMedia.mockReset()
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MicPermissionPage', () => {
  it('asks for the microphone on open and releases the stream when it is granted', async () => {
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] })
    render(<MicPermissionPage />)
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(await screen.findByText('Можно вернуться в панель')).toBeTruthy()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('tells how to allow the microphone when it is denied and can ask again', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'))
    render(<MicPermissionPage />)
    expect(await screen.findByText('Нет доступа к микрофону')).toBeTruthy()
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] })
    fireEvent.click(screen.getByRole('button', { name: 'Запросить снова' }))
    await waitFor(() => {
      expect(screen.getByText('Можно вернуться в панель')).toBeTruthy()
    })
  })
})
