import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VoiceRecorderBar, formatTimer } from './VoiceRecorderBar'

describe('formatTimer', () => {
  it.each([
    [0, '0:00'],
    [7, '0:07'],
    [65, '1:05'],
    [180, '3:00'],
  ])('%i s -> %s', (sec, text) => {
    expect(formatTimer(sec)).toBe(text)
  })
})

describe('VoiceRecorderBar', () => {
  it('shows the timer, the wave and the hint "Говорите…"', () => {
    render(<VoiceRecorderBar elapsedSec={7} level={0.5} />)
    expect(screen.getByText('0:07')).toBeTruthy()
    expect(screen.getByText('Говорите…')).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Идёт запись' })).toBeTruthy()
    expect(screen.getByTestId('voice-wave').children.length).toBeGreaterThan(8)
  })

  it('the bars of the wave grow with the level', () => {
    const height = (level: number) => {
      const { unmount } = render(<VoiceRecorderBar elapsedSec={1} level={level} />)
      const value = screen.getByTestId('voice-wave').querySelectorAll<HTMLElement>('span')[2]?.style.height ?? ''
      unmount()
      return Number.parseFloat(value)
    }
    expect(height(1)).toBeGreaterThan(height(0))
  })
})
