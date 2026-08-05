import { describe, expect, it } from 'vitest'

import { nextFollowingAfterScroll } from './use-auto-scroll'

describe('nextFollowingAfterScroll', () => {
  it('keeps following inside the 64px bottom threshold', () => {
    expect(nextFollowingAfterScroll(true, 1000, 537, 400)).toBe(true)
  })

  it('stops following at or beyond the 64px bottom threshold', () => {
    expect(nextFollowingAfterScroll(true, 1000, 536, 400)).toBe(false)
    expect(nextFollowingAfterScroll(true, 1000, 500, 400)).toBe(false)
  })

  it('does not resume following from a scroll event', () => {
    expect(nextFollowingAfterScroll(false, 1000, 537, 400)).toBe(false)
  })
})
