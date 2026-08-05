import { describe, expect, it } from 'vitest'

import { shouldSendComposerKey } from './ChatComposer'

describe('shouldSendComposerKey', () => {
  it.each([
    ['Enter', false, false, true],
    ['Enter', true, false, false],
    ['Enter', false, true, false],
    ['a', false, false, false],
  ] as const)('returns %s/%s/%s as %s', (key, shiftKey, isComposing, expected) => {
    expect(shouldSendComposerKey(key, shiftKey, isComposing)).toBe(expected)
  })
})
