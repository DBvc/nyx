import { describe, expect, it } from 'vitest'

import { validateNyxThreadTitle } from './title'

describe('Thread title validation', () => {
  it('trims a valid title and counts Unicode code points', () => {
    expect(validateNyxThreadTitle('  你好 👋  ')).toEqual({ ok: true, title: '你好 👋' })
    expect(validateNyxThreadTitle('😀'.repeat(48))).toEqual({
      ok: true,
      title: '😀'.repeat(48),
    })
  })

  it('rejects blank and 49-code-point titles without truncation', () => {
    expect(validateNyxThreadTitle(' \n ')).toEqual({ ok: false, message: 'Enter a title.' })
    expect(validateNyxThreadTitle('界'.repeat(49))).toEqual({
      ok: false,
      message: 'Use 48 characters or fewer.',
    })
  })
})
