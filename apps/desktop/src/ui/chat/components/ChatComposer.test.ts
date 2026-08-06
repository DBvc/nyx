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
  targetOptions: [{ value: 'target-1', label: 'Provider One · Model One' }],
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

function targetSelectOpeningTag(markup: string) {
  const openingTag = markup.match(/<select\b[^>]*>/)?.[0]

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

    expect(sendMarkup.match(/<button/g)).toHaveLength(1)
    expect(sendMarkup).toContain('aria-label="Send message"')
    expect(sendMarkup).not.toContain('Stop response')

    expect(stopMarkup.match(/<button/g)).toHaveLength(1)
    expect(stopMarkup).toContain('aria-label="Stop response"')
    expect(stopMarkup).not.toContain('Send message')
    expect(stopMarkup).toContain('aria-label="Chat target"')
    expect(targetSelectOpeningTag(stopMarkup)).not.toContain(' disabled=""')
  })

  it('describes a disabled loading target selector', () => {
    const markup = renderComposer({
      targetDisabled: true,
      targetStatus: 'Loading targets…',
    })

    expect(markup).toContain('aria-describedby="chat-target-status"')
    expect(markup).toContain('aria-label="Chat target"')
    expect(markup).toContain('disabled=""')
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

    expect(markup).toContain('aria-label="Chat target"')
    expect(targetSelectOpeningTag(markup)).not.toContain(' disabled=""')
    expect(markup).toContain('Refreshing targets…')
  })

  it('keeps an unavailable target selected while offering an alternative', () => {
    const markup = renderComposer({
      canSend: false,
      targetOptions: [
        { value: 'target-old', label: 'Old target (Unavailable)', disabled: true },
        { value: 'target-new', label: 'Provider Two · Model Two' },
      ],
      targetStatus: 'Selected target unavailable. Choose another target.',
      targetValue: 'target-old',
    })

    expect(markup).toContain(
      '<option disabled="" value="target-old" selected="">Old target (Unavailable)</option>',
    )
    expect(markup).toContain('Provider Two · Model Two')
    expect(targetSelectOpeningTag(markup)).not.toContain(' disabled=""')
    expect(sendButtonOpeningTag(markup)).toContain('disabled=""')
  })

  it.each(['Refresh targets', 'Open Connections'])('renders the %s target action', (label) => {
    const markup = renderComposer({
      targetAction: { label, run: () => undefined },
      targetStatus: 'Target action needed.',
    })

    expect(markup).toContain(`>${label}</button>`)
    expect(markup.match(/<button/g)).toHaveLength(2)
  })
})
