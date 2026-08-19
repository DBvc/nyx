import { describe, expect, it, vi } from 'vitest'

import type { NyxConnectionsOverview } from '../../../../shared/connections/types'

import {
  buildComposerTargetOptions,
  composerTargetPresentation,
  isSidebarShortcut,
  readSidebarCollapsed,
} from './ChatWorkspace'
import { currentThreadOutsidePage, currentThreadSidebarStatus } from './ChatSidebar'

const targetDraft = {
  kind: 'connection',
  providerId: 'provider-1',
  modelId: 'model-1',
} as const

function targetOverview(
  providerDisplayName: string,
  modelDisplayName: string,
): NyxConnectionsOverview {
  return {
    providers: [],
    defaultTarget: null,
    defaultTargetSource: 'missing',
    targetCatalog: {
      connectionTargets: [
        {
          providerId: 'provider-1',
          providerDisplayName,
          modelId: 'model-1',
          modelDisplayName,
        },
      ],
      envFallback: null,
    },
  }
}

const readyTarget = {
  isResetting: false,
  hydrationStatus: 'ready' as const,
  connectionStatusKind: 'ready' as const,
  connectionRequestEpoch: 1,
  targetInitialized: true,
  targetCatalogEpoch: 1,
  hasTargetDraft: true,
  targetAvailable: true,
  availableOptionCount: 1,
}

describe('composer target presentation', () => {
  it.each([
    [
      'pending ready catalog',
      { connectionRequestEpoch: 2, targetCatalogEpoch: 1 },
      { status: 'Refreshing targets…', disabled: false, action: null },
    ],
    [
      'consumed ready catalog',
      { connectionRequestEpoch: 2, targetCatalogEpoch: 2 },
      {
        status: 'Selected target unavailable. Choose another target.',
        disabled: false,
        action: null,
      },
    ],
  ] as const)('maps an unavailable target with a %s', (_name, epochs, expected) => {
    expect(
      composerTargetPresentation({
        ...readyTarget,
        ...epochs,
        targetAvailable: false,
      }),
    ).toEqual(expected)
  })

  it.each([
    ['loading', { status: 'Loading targets…', disabled: true, action: null }],
    ['error', { status: null, disabled: true, action: null }],
  ] as const)('maps uninitialized targets after hydration is %s', (hydrationStatus, expected) => {
    expect(
      composerTargetPresentation({
        ...readyTarget,
        hydrationStatus,
        targetInitialized: false,
      }),
    ).toEqual(expected)
  })

  it.each([
    [
      'resetting before failure',
      { isResetting: true, connectionStatusKind: 'failed', targetInitialized: false },
      { status: 'Starting fresh…', disabled: true, action: null },
    ],
    [
      'refresh failure before initialization',
      { connectionStatusKind: 'failed', targetInitialized: false },
      { status: 'Couldn’t refresh targets.', disabled: true, action: 'refresh' },
    ],
    [
      'refresh failure with retained targets',
      { connectionStatusKind: 'failed' },
      { status: 'Couldn’t refresh targets.', disabled: false, action: 'refresh' },
    ],
    [
      'initial loading',
      { connectionStatusKind: 'loading', targetInitialized: false },
      { status: 'Loading targets…', disabled: true, action: null },
    ],
    [
      'background refresh',
      { connectionStatusKind: 'loading' },
      { status: 'Refreshing targets…', disabled: false, action: null },
    ],
    [
      'missing selection with choices',
      { hasTargetDraft: false },
      { status: 'Choose a target.', disabled: false, action: null },
    ],
    [
      'missing selection without choices',
      { hasTargetDraft: false, availableOptionCount: 0 },
      { status: 'No target available.', disabled: true, action: 'connections' },
    ],
    [
      'unavailable selection with a replacement',
      { targetAvailable: false },
      {
        status: 'Selected target unavailable. Choose another target.',
        disabled: false,
        action: null,
      },
    ],
    [
      'unavailable selection without a replacement',
      { targetAvailable: false, availableOptionCount: 0 },
      { status: 'Selected target unavailable.', disabled: true, action: 'connections' },
    ],
    ['ready target', {}, { status: null, disabled: false, action: null }],
  ] as const)('maps %s', (_name, overrides, expected) => {
    expect(composerTargetPresentation({ ...readyTarget, ...overrides })).toEqual(expected)
  })
})

describe('Composer target options', () => {
  it('refreshes labels without changing selection identity or duplicating the draft', () => {
    const before = buildComposerTargetOptions(
      targetOverview('Provider One', 'Model One'),
      targetDraft,
    )
    const after = buildComposerTargetOptions(
      targetOverview('Provider Renamed', 'Model Renamed'),
      targetDraft,
    )

    expect(before).toHaveLength(1)
    expect(after).toHaveLength(1)
    expect(before[0]).toMatchObject({ label: 'Model One', detail: 'Provider One' })
    expect(after[0]).toMatchObject({ label: 'Model Renamed', detail: 'Provider Renamed' })
    expect(after[0]?.value).toBe(before[0]?.value)
    expect(after[0]?.selection).toEqual(targetDraft)
    expect(targetDraft).toEqual({
      kind: 'connection',
      providerId: 'provider-1',
      modelId: 'model-1',
    })
  })

  it('prepends one disabled unavailable option when the draft leaves the catalog', () => {
    const overview = targetOverview('Provider One', 'Model One')
    const options = buildComposerTargetOptions(
      {
        ...overview,
        targetCatalog: {
          ...overview.targetCatalog,
          connectionTargets: [],
        },
      },
      targetDraft,
    )

    expect(options).toEqual([
      {
        value: JSON.stringify(targetDraft),
        label: 'model-1',
        detail: 'provider-1 · Unavailable',
        disambiguation: 'provider-1',
        selection: targetDraft,
        disabled: true,
      },
    ])
  })
})

describe('sidebar workspace helpers', () => {
  it('keeps a selected Thread outside the canonical first page separate', () => {
    const first = {
      availability: 'available' as const,
      id: 'thread-a',
      location: 'available' as const,
      title: 'First',
      threadRevision: 1,
      resultRevision: 0,
      seenResultRevision: 0,
      lastUserActivityAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const selected = { ...first, id: 'thread-b', title: 'Selected' }

    expect(currentThreadOutsidePage('thread-b', selected, [first])).toBe(selected)
    expect(currentThreadOutsidePage('thread-a', first, [first])).toBeNull()
  })

  it('shows live state for the selected Thread outside the canonical first page', () => {
    expect(currentThreadSidebarStatus('submitting', false)).toBe('running')
    expect(currentThreadSidebarStatus('streaming', false)).toBe('running')
    expect(currentThreadSidebarStatus('completed', false)).toBe('idle')
    expect(currentThreadSidebarStatus('failed', true)).toBe('saving_failed')
  })

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
