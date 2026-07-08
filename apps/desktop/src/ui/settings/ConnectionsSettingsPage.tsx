import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  NyxConnectionModelInput,
  NyxConnectionProviderDetail,
  NyxConnectionSaveProviderInput,
  NyxConnectionsOverview,
} from '../../../shared/connections/types'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; overview: NyxConnectionsOverview }
  | { kind: 'failed'; message: string }

type NoticeState = { kind: 'success' | 'error'; message: string } | null

export interface ProviderModelForm {
  id: string
  displayName: string
  enabled: boolean
}

export interface ProviderForm {
  providerId: string | null
  displayName: string
  baseUrl: string
  apiKey: string
  enabled: boolean
  models: ProviderModelForm[]
  defaultModelId: string
  useAsDefault: boolean
}

interface ConnectionsSettingsPageProps {
  onBackToChat: () => void
  onConnectionsChanged: () => void | Promise<void>
}

function createEmptyForm(): ProviderForm {
  return {
    providerId: null,
    displayName: '',
    baseUrl: '',
    apiKey: '',
    enabled: true,
    models: [
      {
        id: '',
        displayName: '',
        enabled: true,
      },
    ],
    defaultModelId: '',
    useAsDefault: false,
  }
}

function formFromProvider(
  provider: NyxConnectionProviderDetail,
  overview: NyxConnectionsOverview,
): ProviderForm {
  return {
    providerId: provider.id,
    displayName: provider.displayName,
    baseUrl: provider.baseUrl,
    apiKey: '',
    enabled: provider.enabled,
    models: provider.models.map((model) => ({
      id: model.id,
      displayName: model.displayName === model.id ? '' : model.displayName,
      enabled: model.enabled,
    })),
    defaultModelId: provider.defaultModelId ?? provider.models[0]?.id ?? '',
    useAsDefault: overview.defaultTarget?.providerId === provider.id,
  }
}

function rendererErrorMessage(_error: unknown) {
  return 'Nyx could not complete this Connections action.'
}

export function normalizeModels(models: ProviderModelForm[]): NyxConnectionModelInput[] {
  const normalized = models.map((model) => {
    const normalizedModel: NyxConnectionModelInput = {
      id: model.id.trim(),
      enabled: model.enabled,
    }
    const displayName = model.displayName.trim()

    if (displayName) {
      normalizedModel.displayName = displayName
    }

    return normalizedModel
  })

  if (normalized.length === 0 || normalized.some((model) => model.id.length === 0)) {
    throw new Error('Every model needs an id.')
  }

  return normalized
}

export function defaultModelIdFromForm(form: ProviderForm, models: NyxConnectionModelInput[]) {
  const requestedDefault = form.defaultModelId.trim()

  if (requestedDefault && models.some((model) => model.id === requestedDefault)) {
    return requestedDefault
  }

  return models.find((model) => model.enabled)?.id ?? models[0]?.id ?? ''
}

export function validateDefaultTargetReadiness({
  apiKey,
  defaultModelId,
  form,
  hasStoredCredential,
  models,
}: {
  apiKey: string
  defaultModelId: string
  form: Pick<ProviderForm, 'enabled' | 'useAsDefault'>
  hasStoredCredential: boolean
  models: ReadonlyArray<NyxConnectionModelInput>
}) {
  if (!form.useAsDefault) {
    return
  }

  if (!form.enabled) {
    throw new Error('Default target needs an enabled provider.')
  }

  const defaultModel = models.find((model) => model.id === defaultModelId)

  if (!defaultModel?.enabled) {
    throw new Error('Default target needs an enabled model.')
  }

  if (!apiKey.trim() && !hasStoredCredential) {
    throw new Error('Default target needs a saved API key.')
  }
}

function providerLabel(overview: NyxConnectionsOverview, providerId: string | null) {
  if (!providerId) {
    return 'New provider'
  }

  return (
    overview.providers.find((provider) => provider.id === providerId)?.displayName ??
    'Saved provider'
  )
}

export function ConnectionsSettingsPage({
  onBackToChat,
  onConnectionsChanged,
}: ConnectionsSettingsPageProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' })
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderForm>(() => createEmptyForm())
  const [notice, setNotice] = useState<NoticeState>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const overview = loadState.kind === 'ready' ? loadState.overview : null
  const selectedSummary = overview?.providers.find((provider) => provider.id === selectedProviderId)
  const modelOptions = useMemo(
    () => form.models.map((model) => model.id.trim()).filter(Boolean),
    [form.models],
  )

  const readProvider = useCallback(
    async (providerId: string, nextOverview: NyxConnectionsOverview) => {
      const connections = window.nyx?.connections

      if (!connections) {
        setNotice({
          kind: 'error',
          message: 'Nyx desktop connections bridge is unavailable.',
        })
        return
      }

      setIsLoadingDetail(true)

      try {
        const result = await connections.getProvider({ providerId })

        if (!result.ok) {
          setNotice({ kind: 'error', message: result.error.message })
          return
        }

        setSelectedProviderId(providerId)
        setForm(formFromProvider(result.value, nextOverview))
      } catch (error) {
        setNotice({ kind: 'error', message: rendererErrorMessage(error) })
      } finally {
        setIsLoadingDetail(false)
      }
    },
    [],
  )

  const refreshOverview = useCallback(
    async (preferredProviderId?: string | null) => {
      const connections = window.nyx?.connections

      if (!connections) {
        setLoadState({
          kind: 'failed',
          message: 'Nyx desktop connections bridge is unavailable.',
        })
        return
      }

      setLoadState({ kind: 'loading' })

      try {
        const result = await connections.getOverview()

        if (!result.ok) {
          setLoadState({ kind: 'failed', message: result.error.message })
          return
        }

        const nextOverview = result.value
        setLoadState({ kind: 'ready', overview: nextOverview })

        const nextProviderId =
          preferredProviderId ??
          nextOverview.defaultTarget?.providerId ??
          nextOverview.providers[0]?.id ??
          null

        if (
          nextProviderId &&
          nextOverview.providers.some((provider) => provider.id === nextProviderId)
        ) {
          await readProvider(nextProviderId, nextOverview)
        } else {
          setSelectedProviderId(null)
          setForm(createEmptyForm())
        }
      } catch (error) {
        setLoadState({ kind: 'failed', message: rendererErrorMessage(error) })
      }
    },
    [readProvider],
  )

  useEffect(() => {
    void refreshOverview()
  }, [refreshOverview])

  function updateForm(patch: Partial<ProviderForm>) {
    setForm((current) => ({ ...current, ...patch }))
  }

  function updateModel(index: number, patch: Partial<ProviderModelForm>) {
    setForm((current) => {
      const models = current.models.map((model, modelIndex) =>
        modelIndex === index ? { ...model, ...patch } : model,
      )
      const defaultModelId =
        patch.id !== undefined && current.defaultModelId === current.models[index]?.id
          ? patch.id
          : current.defaultModelId

      return { ...current, models, defaultModelId }
    })
  }

  function addModel() {
    setForm((current) => ({
      ...current,
      models: [...current.models, { id: '', displayName: '', enabled: true }],
    }))
  }

  function removeModel(index: number) {
    setForm((current) => {
      if (current.models.length <= 1) {
        return current
      }

      const models = current.models.filter((_, modelIndex) => modelIndex !== index)
      const modelIds = models.map((model) => model.id.trim()).filter(Boolean)
      const defaultModelId = modelIds.includes(current.defaultModelId)
        ? current.defaultModelId
        : (modelIds[0] ?? '')

      return { ...current, models, defaultModelId }
    })
  }

  async function handleSave() {
    const connections = window.nyx?.connections

    if (!connections) {
      setNotice({ kind: 'error', message: 'Nyx desktop connections bridge is unavailable.' })
      return
    }

    setIsSaving(true)
    setNotice(null)

    try {
      const models = normalizeModels(form.models)
      const defaultModelId = defaultModelIdFromForm(form, models)

      if (!form.displayName.trim()) {
        throw new Error('Provider name is required.')
      }

      if (!form.baseUrl.trim()) {
        throw new Error('Base URL is required.')
      }

      if (!defaultModelId) {
        throw new Error('Choose a default model.')
      }

      const apiKey = form.apiKey.trim()
      validateDefaultTargetReadiness({
        apiKey,
        defaultModelId,
        form,
        hasStoredCredential: selectedSummary?.credentialStatus === 'stored',
        models,
      })
      const saveInput: NyxConnectionSaveProviderInput = {
        kind: 'openai-compatible',
        displayName: form.displayName.trim(),
        baseUrl: form.baseUrl.trim(),
        enabled: form.enabled,
        models,
        defaultModelId,
      }

      if (form.providerId) {
        saveInput.providerId = form.providerId
      }

      if (apiKey) {
        saveInput.credential = { kind: 'api_key', value: apiKey }
      }

      const saveResult = await connections.saveProvider(saveInput)

      if (!saveResult.ok) {
        setNotice({ kind: 'error', message: saveResult.error.message })
        return
      }

      if (form.useAsDefault) {
        const defaultResult = await connections.setDefaultTarget({
          target: {
            providerId: saveResult.value.id,
            modelId: saveResult.value.defaultModelId ?? defaultModelId,
          },
        })

        if (!defaultResult.ok) {
          setNotice({ kind: 'error', message: defaultResult.error.message })
          return
        }
      } else if (overview?.defaultTarget?.providerId === saveResult.value.id) {
        const defaultResult = await connections.setDefaultTarget({ target: null })

        if (!defaultResult.ok) {
          setNotice({ kind: 'error', message: defaultResult.error.message })
          return
        }
      }

      setNotice({ kind: 'success', message: 'Connection saved.' })
      await refreshOverview(saveResult.value.id)
      await onConnectionsChanged()
    } catch (error) {
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : rendererErrorMessage(error),
      })
    } finally {
      setIsSaving(false)
      setForm((current) => ({ ...current, apiKey: '' }))
    }
  }

  async function handleDelete() {
    const connections = window.nyx?.connections

    if (!connections || !form.providerId) {
      return
    }

    const shouldDelete = window.confirm(`Delete ${providerLabel(overview!, form.providerId)}?`)

    if (!shouldDelete) {
      return
    }

    setIsDeleting(true)
    setNotice(null)

    try {
      const result = await connections.deleteProvider({ providerId: form.providerId })

      if (!result.ok) {
        setNotice({ kind: 'error', message: result.error.message })
        return
      }

      setNotice({ kind: 'success', message: 'Connection deleted.' })
      await refreshOverview(null)
      await onConnectionsChanged()
    } catch (error) {
      setNotice({ kind: 'error', message: rendererErrorMessage(error) })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col bg-nyx-canvas'>
      <header className='flex h-12 shrink-0 items-center justify-between border-b border-nyx-line-soft px-4'>
        <div className='flex min-w-0 items-center gap-2'>
          <button
            className='h-8 rounded-md px-2 text-[13px] text-nyx-muted hover:bg-nyx-hover hover:text-nyx-ink'
            onClick={onBackToChat}
            type='button'
          >
            Chat
          </button>
          <span className='text-[12px] text-nyx-subtle'>/</span>
          <h1 className='truncate text-[13px] font-semibold text-nyx-ink'>
            Settings / Connections
          </h1>
        </div>
      </header>

      <div className='min-h-0 flex-1 overflow-y-auto px-5 py-5'>
        <div className='mx-auto grid w-full max-w-[70rem] gap-4 lg:grid-cols-[19rem_1fr]'>
          <aside className='rounded-xl border border-nyx-line-soft bg-nyx-sidebar p-2'>
            <div className='flex items-center justify-between px-2 py-2'>
              <h2 className='text-[12px] font-semibold text-nyx-ink'>Providers</h2>
              <button
                className='h-7 rounded-md border border-nyx-line bg-white px-2 text-[12px] text-nyx-ink hover:bg-nyx-hover'
                onClick={() => {
                  setSelectedProviderId(null)
                  setForm(createEmptyForm())
                  setNotice(null)
                }}
                type='button'
              >
                New
              </button>
            </div>

            {loadState.kind === 'loading' ? (
              <p className='px-2 py-3 text-[12px] text-nyx-muted'>Loading connections...</p>
            ) : null}

            {loadState.kind === 'failed' ? (
              <div className='rounded-lg border border-red-200 bg-red-50 px-3 py-3'>
                <p className='text-[12px] font-medium text-red-950'>Could not load connections</p>
                <p className='mt-1 text-[12px] leading-5 text-red-900/70'>{loadState.message}</p>
                <button
                  className='mt-3 h-7 rounded-md border border-red-200 bg-white px-2 text-[12px] text-red-950 hover:bg-red-50'
                  onClick={() => {
                    void refreshOverview()
                  }}
                  type='button'
                >
                  Retry
                </button>
              </div>
            ) : null}

            {overview ? (
              <div className='space-y-1'>
                {overview.providers.length === 0 ? (
                  <p className='px-2 py-3 text-[12px] leading-5 text-nyx-muted'>
                    No saved providers yet.
                  </p>
                ) : null}
                {overview.providers.map((provider) => {
                  const isDefault = overview.defaultTarget?.providerId === provider.id
                  const isSelected = selectedProviderId === provider.id

                  return (
                    <button
                      className={`w-full rounded-lg px-3 py-2 text-left ${
                        isSelected ? 'bg-nyx-panel-strong' : 'hover:bg-nyx-hover'
                      }`}
                      key={provider.id}
                      onClick={() => {
                        setNotice(null)
                        void readProvider(provider.id, overview)
                      }}
                      type='button'
                    >
                      <span className='block truncate text-[13px] font-medium text-nyx-ink'>
                        {provider.displayName}
                      </span>
                      <span className='mt-1 block truncate text-[12px] text-nyx-muted'>
                        {provider.baseUrlHost ?? 'Unknown host'} · {provider.modelCount} models
                      </span>
                      <span className='mt-2 flex flex-wrap gap-1.5'>
                        {isDefault ? (
                          <span className='rounded-full bg-white px-2 py-0.5 text-[11px] text-nyx-ink'>
                            Default
                          </span>
                        ) : null}
                        <span className='rounded-full bg-white px-2 py-0.5 text-[11px] text-nyx-muted'>
                          {provider.credentialStatus === 'stored' ? 'Key stored' : 'No key'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </aside>

          <section className='rounded-xl border border-nyx-line-soft bg-white'>
            <div className='border-b border-nyx-line-soft px-5 py-4'>
              <p className='text-[12px] font-medium text-nyx-subtle'>
                {form.providerId ? 'OpenAI-compatible provider' : 'New OpenAI-compatible provider'}
              </p>
              <h2 className='mt-1 text-[18px] font-semibold text-nyx-ink'>
                {overview ? providerLabel(overview, form.providerId) : 'Connections'}
              </h2>
              {selectedSummary ? (
                <p className='mt-1 text-[12px] text-nyx-muted'>
                  {selectedSummary.credentialStatus === 'stored'
                    ? 'A saved API key exists. Enter a new one only to replace it.'
                    : 'No API key is saved for this provider.'}
                </p>
              ) : null}
            </div>

            <div className='space-y-5 px-5 py-5'>
              {notice ? (
                <div
                  className={`rounded-lg border px-3 py-2 text-[12px] ${
                    notice.kind === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                      : 'border-red-200 bg-red-50 text-red-950'
                  }`}
                >
                  {notice.message}
                </div>
              ) : null}

              <fieldset className='grid gap-4 md:grid-cols-2' disabled={isLoadingDetail}>
                <label className='space-y-1.5'>
                  <span className='text-[12px] font-medium text-nyx-ink'>Provider name</span>
                  <input
                    className='h-9 w-full rounded-md border border-nyx-line bg-white px-3 text-[13px] text-nyx-ink outline-none focus:border-[#bdbdb8]'
                    onChange={(event) => {
                      updateForm({ displayName: event.target.value })
                    }}
                    placeholder='Local relay'
                    value={form.displayName}
                  />
                </label>

                <label className='space-y-1.5'>
                  <span className='text-[12px] font-medium text-nyx-ink'>Base URL</span>
                  <input
                    className='h-9 w-full rounded-md border border-nyx-line bg-white px-3 text-[13px] text-nyx-ink outline-none focus:border-[#bdbdb8]'
                    onChange={(event) => {
                      updateForm({ baseUrl: event.target.value })
                    }}
                    placeholder='https://api.example.com/v1'
                    spellCheck={false}
                    value={form.baseUrl}
                  />
                </label>

                <label className='space-y-1.5 md:col-span-2'>
                  <span className='text-[12px] font-medium text-nyx-ink'>API key</span>
                  <input
                    autoComplete='off'
                    className='h-9 w-full rounded-md border border-nyx-line bg-white px-3 text-[13px] text-nyx-ink outline-none focus:border-[#bdbdb8]'
                    onChange={(event) => {
                      updateForm({ apiKey: event.target.value })
                    }}
                    placeholder={
                      form.providerId
                        ? 'Leave blank to keep the saved key'
                        : 'Paste a key to save it encrypted locally'
                    }
                    type='password'
                    value={form.apiKey}
                  />
                </label>
              </fieldset>

              <section>
                <div className='flex items-center justify-between'>
                  <h3 className='text-[13px] font-semibold text-nyx-ink'>Models</h3>
                  <button
                    className='h-8 rounded-md border border-nyx-line bg-white px-3 text-[12px] text-nyx-ink hover:bg-nyx-hover'
                    onClick={addModel}
                    type='button'
                  >
                    Add model
                  </button>
                </div>
                <div className='mt-3 space-y-2'>
                  {form.models.map((model, index) => (
                    <div
                      className='grid gap-2 rounded-lg border border-nyx-line-soft bg-nyx-panel/50 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]'
                      key={index}
                    >
                      <input
                        aria-label={`Model ${index + 1} id`}
                        className='h-8 rounded-md border border-nyx-line bg-white px-2 text-[13px] outline-none focus:border-[#bdbdb8]'
                        onChange={(event) => {
                          updateModel(index, { id: event.target.value })
                        }}
                        placeholder='model-id'
                        spellCheck={false}
                        value={model.id}
                      />
                      <input
                        aria-label={`Model ${index + 1} display name`}
                        className='h-8 rounded-md border border-nyx-line bg-white px-2 text-[13px] outline-none focus:border-[#bdbdb8]'
                        onChange={(event) => {
                          updateModel(index, { displayName: event.target.value })
                        }}
                        placeholder='Display name'
                        value={model.displayName}
                      />
                      <label className='flex h-8 items-center gap-2 text-[12px] text-nyx-muted'>
                        <input
                          checked={model.enabled}
                          onChange={(event) => {
                            updateModel(index, { enabled: event.target.checked })
                          }}
                          type='checkbox'
                        />
                        Enabled
                      </label>
                      <button
                        className='h-8 rounded-md px-2 text-[12px] text-nyx-muted hover:bg-white hover:text-nyx-ink disabled:opacity-40'
                        disabled={form.models.length <= 1}
                        onClick={() => {
                          removeModel(index)
                        }}
                        type='button'
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <div className='grid gap-4 md:grid-cols-2'>
                <label className='space-y-1.5'>
                  <span className='text-[12px] font-medium text-nyx-ink'>Default model</span>
                  <select
                    className='h-9 w-full rounded-md border border-nyx-line bg-white px-3 text-[13px] text-nyx-ink outline-none focus:border-[#bdbdb8]'
                    onChange={(event) => {
                      updateForm({ defaultModelId: event.target.value })
                    }}
                    value={form.defaultModelId}
                  >
                    <option value=''>Choose a model</option>
                    {modelOptions.map((modelId) => (
                      <option key={modelId} value={modelId}>
                        {modelId}
                      </option>
                    ))}
                  </select>
                </label>

                <div className='flex items-end'>
                  <label className='flex h-9 items-center gap-2 text-[13px] text-nyx-ink'>
                    <input
                      checked={form.useAsDefault}
                      onChange={(event) => {
                        updateForm({ useAsDefault: event.target.checked })
                      }}
                      type='checkbox'
                    />
                    Use as default target
                  </label>
                </div>
              </div>

              <label className='flex items-center gap-2 text-[13px] text-nyx-ink'>
                <input
                  checked={form.enabled}
                  onChange={(event) => {
                    updateForm({ enabled: event.target.checked })
                  }}
                  type='checkbox'
                />
                Provider enabled
              </label>

              <div className='flex flex-col gap-2 border-t border-nyx-line-soft pt-4 sm:flex-row sm:items-center sm:justify-between'>
                <button
                  className='h-9 rounded-md bg-nyx-accent px-4 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-45'
                  disabled={isSaving || isLoadingDetail}
                  onClick={() => {
                    void handleSave()
                  }}
                  type='button'
                >
                  {isSaving ? 'Saving...' : 'Save connection'}
                </button>

                {form.providerId ? (
                  <button
                    className='h-9 rounded-md px-3 text-[13px] text-red-700 hover:bg-red-50 disabled:opacity-45'
                    disabled={isDeleting || isSaving}
                    onClick={() => {
                      void handleDelete()
                    }}
                    type='button'
                  >
                    {isDeleting ? 'Deleting...' : 'Delete provider'}
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
