import { describe, expect, it } from 'vitest'
import { SamePasswordError, WeakPasswordError, WrongPasswordError } from '../auth-api'
import { passwordErrorText } from './password-error'

describe('passwordErrorText', () => {
  it('translates policy violation codes and keeps unknown ones', () => {
    const error = new WeakPasswordError('x', ['too-short', 'no-digit', 'Нужна заглавная'])
    expect(passwordErrorText(error, 'forced')).toBe(
      'Пароль короче 10 символов. Добавьте хотя бы одну цифру. Нужна заглавная',
    )
  })

  it('names the wrong password by the kind of the change', () => {
    const error = new WrongPasswordError('x', 401, 'WRONG_PASSWORD')
    expect(passwordErrorText(error, 'forced')).toBe('Неверный временный пароль')
    expect(passwordErrorText(error, 'voluntary')).toBe('Неверный текущий пароль')
  })

  it('explains the same password and falls back to a generic text', () => {
    expect(passwordErrorText(new SamePasswordError('x', 422, 'SAME'), 'forced')).toContain(
      'временным',
    )
    expect(passwordErrorText(new Error('boom'), 'voluntary')).toContain('Не удалось')
  })
})
