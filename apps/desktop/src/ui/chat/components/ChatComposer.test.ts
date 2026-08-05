import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ChatComposer, shouldSendComposerKey } from './ChatComposer'

function renderComposer(isBusy: boolean) {
  return renderToStaticMarkup(
    createElement(ChatComposer, {
      input: 'Hello',
      isBusy,
      canSend: !isBusy,
      disabled: false,
      onInputChange: () => undefined,
      onSend: () => undefined,
      onStop: () => undefined,
    }),
  )
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
    const sendMarkup = renderComposer(false)
    const stopMarkup = renderComposer(true)

    expect(sendMarkup.match(/<button/g)).toHaveLength(1)
    expect(sendMarkup).toContain('aria-label="Send message"')
    expect(sendMarkup).not.toContain('Stop response')

    expect(stopMarkup.match(/<button/g)).toHaveLength(1)
    expect(stopMarkup).toContain('aria-label="Stop response"')
    expect(stopMarkup).not.toContain('Send message')
  })
})
