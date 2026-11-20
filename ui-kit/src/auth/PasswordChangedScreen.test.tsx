import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PasswordChangedScreen } from './PasswordChangedScreen'

describe('PasswordChangedScreen', () => {
  it('explains that other sessions ended and continues', async () => {
    const onContinue = vi.fn()
    render(<PasswordChangedScreen onContinue={onContinue} />)
    expect(screen.getByRole('heading', { name: 'Пароль изменён' })).toBeTruthy()
    expect(screen.getByText(/Все другие сеансы завершены\. На этом устройстве вы остаётесь в системе\./)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Вернуться к работе' }))
    expect(onContinue).toHaveBeenCalledOnce()
  })
})
