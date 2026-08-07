import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'

import { ChatComposer, shouldSendComposerKey } from './ChatComposer'

const defaultProps: ComponentProps<typeof ChatComposer> = {
  input: 'Hello',
  isBusy: false,
  canSend: true,
  disabled: false,
  targetDisabled: false,
  targetOptions: [
    {
      value: 'target-1',
      label: 'Model One',
      detail: 'Provider One',
      disambiguation: 'Provider One',
    },
  ],
  targetAction: null,
  targetStatus: null,
  targetValue: 'target-1',
  onInputChange: () => undefined,
  onTargetChange: () => undefined,
  onSend: () => undefined,
  onStop: () => undefined,
}

function renderComposer(overrides: Partial<ComponentProps<typeof ChatComposer>> = {}) {
  return renderToStaticMarkup(
    createElement(ChatComposer, {
      ...defaultProps,
      ...overrides,
    }),
  )
}

function targetTriggerOpeningTag(markup: string) {
  const openingTag = markup.match(/<button\b[^>]*aria-haspopup="dialog"[^>]*>/)?.[0]

  expect(openingTag).toBeTypeOf('string')
  return openingTag as string
}

function targetTriggerContent(markup: string) {
  const content = markup.match(
    /<button\b[^>]*aria-haspopup="dialog"[^>]*>([\s\S]*?)<\/button>/,
  )?.[1]

  expect(content).toBeTypeOf('string')
  return content as string
}

function selectedTargetOpeningTag(markup: string) {
  const openingTag = markup.match(/<button\b[^>]*aria-pressed="true"[^>]*>/)?.[0]

  expect(openingTag).toBeTypeOf('string')
  return openingTag as string
}

function sendButtonOpeningTag(markup: string) {
  const openingTag = markup.match(/<button\b[^>]*aria-label="Send message"[^>]*>/)?.[0]

  expect(openingTag).toBeTypeOf('string')
  return openingTag as string
}

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

describe('ChatComposer', () => {
  it('uses one action button for sending and stopping', () => {
    const sendMarkup = renderComposer()
    const stopMarkup = renderComposer({ isBusy: true, canSend: false })

    expect(sendMarkup).toContain('aria-label="Send message"')
    expect(sendMarkup).not.toContain('Stop response')
    expect(sendMarkup).not.toContain('<select')
    expect(sendMarkup).toContain('popoverTarget="chat-target-popover"')
    expect(sendMarkup).toContain('role="dialog"')

    expect(stopMarkup).toContain('aria-label="Stop response"')
    expect(stopMarkup).not.toContain('Send message')
    expect(targetTriggerOpeningTag(stopMarkup)).not.toContain(' disabled=""')
  })

  it('describes a disabled loading target trigger', () => {
    const markup = renderComposer({
      targetDisabled: true,
      targetOptions: [],
      targetValue: '',
      targetStatus: 'Loading targets…',
    })

    expect(markup).toContain('aria-describedby="chat-target-status"')
    expect(targetTriggerOpeningTag(markup)).toContain('aria-label="Chat target: Loading targets…"')
    expect(targetTriggerOpeningTag(markup)).toContain('disabled=""')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('id="chat-target-status"')
    expect(markup).toContain('Loading targets…')
  })

  it('keeps the target selector enabled while a response is active', () => {
    const markup = renderComposer({
      isBusy: true,
      canSend: false,
      targetStatus: 'Refreshing targets…',
    })

    expect(targetTriggerOpeningTag(markup)).not.toContain(' disabled=""')
    expect(markup).toContain('Refreshing targets…')
  })

  it('keeps an unavailable target selected while offering an alternative', () => {
    const markup = renderComposer({
      canSend: false,
      targetOptions: [
        {
          value: 'target-old',
          label: 'Old model',
          detail: 'Provider One · Unavailable',
          disambiguation: 'Provider One',
          disabled: true,
        },
        {
          value: 'target-new',
          label: 'Model Two',
          detail: 'Provider Two',
          disambiguation: 'Provider Two',
        },
      ],
      targetStatus: 'Selected target unavailable. Choose another target.',
      targetValue: 'target-old',
    })

    expect(markup).not.toContain('<select')
    expect(markup).toContain('Old model')
    expect(markup).toContain('Provider One · Unavailable')
    expect(markup).toContain('Model Two')
    expect(markup).toContain('Provider Two')
    expect(selectedTargetOpeningTag(markup)).toContain('disabled=""')
    expect(targetTriggerOpeningTag(markup)).toContain(
      'aria-label="Chat target: Old model · Provider One · Unavailable"',
    )
    expect(targetTriggerOpeningTag(markup)).not.toContain(' disabled=""')
    expect(targetTriggerContent(markup)).toContain('lucide-circle-alert')
    expect(targetTriggerContent(markup)).toContain('aria-hidden="true"')
    expect(sendButtonOpeningTag(markup)).toContain('disabled=""')
  })

  it('exposes a unique target provider without adding it to the collapsed text', () => {
    const uniqueMarkup = renderComposer()

    expect(targetTriggerOpeningTag(uniqueMarkup)).toContain(
      'aria-label="Chat target: Model One · Provider One"',
    )
    expect(targetTriggerContent(uniqueMarkup)).toContain('Model One')
    expect(targetTriggerContent(uniqueMarkup)).not.toContain('Provider One')
  })

  it('shows and exposes the provider when model names collide', () => {
    const duplicateMarkup = renderComposer({
      targetOptions: [
        ...defaultProps.targetOptions,
        {
          value: 'target-2',
          label: 'Model One',
          detail: 'Provider Two',
          disambiguation: 'Provider Two',
        },
      ],
    })

    expect(targetTriggerOpeningTag(duplicateMarkup)).toContain(
      'aria-label="Chat target: Model One · Provider One"',
    )
    expect(targetTriggerContent(duplicateMarkup)).toContain('Model One')
    expect(targetTriggerContent(duplicateMarkup)).toContain('Provider One')
  })

  it.each(['Refresh targets', 'Open Connections'])('renders the %s target action', (label) => {
    const markup = renderComposer({
      targetAction: { label, run: () => undefined },
      targetStatus: 'Target action needed.',
    })

    expect(markup).toContain(`>${label}</button>`)
    expect(targetTriggerOpeningTag(markup)).not.toContain('disabled=""')
  })

  it('keeps Connections reachable when no target is available', () => {
    const markup = renderComposer({
      targetAction: { label: 'Open Connections', run: () => undefined },
      targetDisabled: true,
      targetOptions: [],
      targetStatus: 'No target available.',
      targetValue: '',
    })

    expect(targetTriggerOpeningTag(markup)).not.toContain('disabled=""')
    expect(markup).toContain('>Open Connections</button>')
  })
})
