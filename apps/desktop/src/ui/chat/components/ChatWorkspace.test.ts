import { describe, expect, it, vi } from 'vitest'

import { isSidebarShortcut, readSidebarCollapsed } from './ChatWorkspace'

describe('sidebar workspace helpers', () => {
  it.each([
    [undefined, false],
    [{ getItem: (): string | null => null }, false],
    [{ getItem: (): string | null => 'invalid' }, false],
    [{ getItem: (): string | null => 'false' }, false],
    [{ getItem: (): string | null => 'true' }, true],
  ] as const)('reads the sidebar preference safely', (storage, expected) => {
    expect(readSidebarCollapsed(storage)).toBe(expected)
  })

  it('defaults to expanded when storage access fails', () => {
    expect(
      readSidebarCollapsed({
        getItem: vi.fn(() => {
          throw new Error('blocked')
        }),
      }),
    ).toBe(false)
  })

  it.each([
    ['darwin', 'b', true, false, false, false, false, true],
    ['darwin', 'b', false, true, false, false, false, false],
    ['linux', 'b', false, true, false, false, false, true],
    ['win32', 'b', true, false, false, false, false, false],
    ['darwin', 'b', true, true, false, false, false, false],
    ['linux', 'b', true, true, false, false, false, false],
    ['darwin', 'b', true, false, true, false, false, false],
    ['darwin', 'b', true, false, false, true, false, false],
    ['darwin', 'b', true, false, false, false, true, false],
    ['darwin', 'x', true, false, false, false, false, false],
  ] as const)(
    'matches only the platform sidebar shortcut',
    (platform, key, metaKey, ctrlKey, altKey, shiftKey, repeat, expected) => {
      expect(isSidebarShortcut({ key, metaKey, ctrlKey, altKey, shiftKey, repeat }, platform)).toBe(
        expected,
      )
    },
  )
})
