import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import componentSource from './ConnectionsSettingsPage.tsx?raw'

import {
  ConnectionsSettingsPage,
  defaultModelIdFromForm,
  modelFormsFromProfiles,
  normalizeModels,
  type ProviderForm,
  validateDefaultTargetReadiness,
} from './ConnectionsSettingsPage'

function form(overrides: Partial<ProviderForm> = {}): ProviderForm {
  return {
    providerId: null,
    displayName: 'Local Relay',
    baseUrl: 'https://api.example.com/v1',
    apiKey: '',
    enabled: true,
    models: [
      {
        id: 'model-1',
        displayName: '',
        enabled: true,
      },
    ],
    defaultModelId: 'model-1',
    useAsDefault: true,
    ...overrides,
  }
}

describe('ConnectionsSettingsPage form helpers', () => {
  it('renders explicit API key reveal and copy controls', () => {
    const markup = renderToStaticMarkup(
      createElement(ConnectionsSettingsPage, {
        onBackToChat: () => undefined,
        onConnectionsChanged: () => undefined,
      }),
    )

    expect(markup).toContain('aria-label="Show API key"')
    expect(markup).toContain('aria-label="Copy API key"')
  })

  it('locks provider switching while a stored-credential action is pending', () => {
    expect(componentSource.match(/disabled=\{isCredentialActionPending\}/g)).toHaveLength(2)
  })

  it('hides the API key when an empty overview resets the provider form', () => {
    expect(componentSource).toMatch(
      /else \{\s*setSelectedProviderId\(null\)\s*setForm\(createEmptyForm\(\)\)\s*setIsApiKeyVisible\(false\)/,
    )
  })

  it('normalizes model inputs without writing undefined optional fields', () => {
    expect(normalizeModels(form().models)).toEqual([
      {
        id: 'model-1',
        enabled: true,
      },
    ])
  })

  it('chooses the requested default model when it exists', () => {
    const currentForm = form({
      defaultModelId: 'model-2',
      models: [
        {
          id: 'model-1',
          displayName: '',
          enabled: true,
        },
        {
          id: 'model-2',
          displayName: '',
          enabled: true,
        },
      ],
    })

    expect(defaultModelIdFromForm(currentForm, normalizeModels(currentForm.models))).toBe('model-2')
  })

  it('rejects default targets that would not be usable for chat', () => {
    const currentForm = form()
    const models = normalizeModels(currentForm.models)

    expect(() =>
      validateDefaultTargetReadiness({
        apiKey: '',
        defaultModelId: 'model-1',
        form: currentForm,
        hasStoredCredential: false,
        models,
      }),
    ).toThrow('Default target needs a saved API key.')

    expect(() =>
      validateDefaultTargetReadiness({
        apiKey: 'sk-new',
        defaultModelId: 'model-1',
        form: { ...currentForm, enabled: false },
        hasStoredCredential: false,
        models,
      }),
    ).toThrow('Default target needs an enabled provider.')

    expect(() =>
      validateDefaultTargetReadiness({
        apiKey: 'sk-new',
        defaultModelId: 'model-1',
        form: currentForm,
        hasStoredCredential: false,
        models: [{ ...models[0]!, enabled: false }],
      }),
    ).toThrow('Default target needs an enabled model.')
  })

  it('allows default targets with a newly typed or previously stored key', () => {
    const currentForm = form()
    const models = normalizeModels(currentForm.models)

    expect(() =>
      validateDefaultTargetReadiness({
        apiKey: 'sk-new',
        defaultModelId: 'model-1',
        form: currentForm,
        hasStoredCredential: false,
        models,
      }),
    ).not.toThrow()

    expect(() =>
      validateDefaultTargetReadiness({
        apiKey: '',
        defaultModelId: 'model-1',
        form: currentForm,
        hasStoredCredential: true,
        models,
      }),
    ).not.toThrow()
  })

  it('maps refreshed provider models back to editable form rows', () => {
    expect(
      modelFormsFromProfiles([
        {
          id: 'manual-model',
          displayName: 'Manual Model',
          enabled: true,
          source: 'manual',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
        {
          id: 'discovered-model',
          displayName: 'discovered-model',
          enabled: true,
          source: 'discovered',
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
        },
      ]),
    ).toEqual([
      {
        id: 'manual-model',
        displayName: 'Manual Model',
        enabled: true,
      },
      {
        id: 'discovered-model',
        displayName: '',
        enabled: true,
      },
    ])
  })
})
