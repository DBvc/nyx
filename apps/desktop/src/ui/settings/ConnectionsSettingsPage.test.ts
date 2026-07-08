import { describe, expect, it } from 'vitest'

import {
  defaultModelIdFromForm,
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
})
