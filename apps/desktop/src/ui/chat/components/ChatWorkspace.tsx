import { PanelLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ConnectionsSettingsPage } from '../../settings/ConnectionsSettingsPage'
import { threadPreview } from '../chat-presenters'
import { toThreadStreamItems } from '../thread-items'
import { useAutoScroll } from '../use-auto-scroll'
import { useChatSession } from '../use-chat-session'
import { useConnectionStatus } from '../use-connection-status'
import { chatTargetSelectionKey } from '../connection-status'
import type { NyxChatTargetSelection } from '../../../../shared/chat/types'
import type { NyxConnectionsOverview } from '../../../../shared/connections/types'
import { ChatComposer } from './ChatComposer'
import { ChatHeader } from './ChatHeader'
import { ChatSidebar, currentThreadSidebarStatus } from './ChatSidebar'
import { ChatThread } from './ChatThread'

type WorkspaceView = 'chat' | 'connections'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'nyx.sidebar.collapsed.v1'

interface SidebarShortcutInput {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
}

type ComposerTargetAction = 'refresh' | 'connections' | null

interface ComposerTargetPresentation {
  status: string | null
  disabled: boolean
  action: ComposerTargetAction
}

interface ComposerTargetOption {
  value: string
  label: string
  detail: string
  disambiguation: string
  selection: NyxChatTargetSelection
  disabled?: boolean
}

export function buildComposerTargetOptions(
  overview: NyxConnectionsOverview | null,
  targetDraft: NyxChatTargetSelection | null,
): ComposerTargetOption[] {
  const options: ComposerTargetOption[] = []

  for (const target of overview?.targetCatalog.connectionTargets ?? []) {
    const selection = {
      kind: 'connection',
      providerId: target.providerId,
      modelId: target.modelId,
    } as const satisfies NyxChatTargetSelection

    options.push({
      value: chatTargetSelectionKey(selection),
      label: target.modelDisplayName,
      detail: target.providerDisplayName,
      disambiguation: target.providerDisplayName,
      selection,
    })
  }

  if (overview?.targetCatalog.envFallback) {
    const selection = { kind: 'env_fallback' } as const satisfies NyxChatTargetSelection
    options.push({
      value: chatTargetSelectionKey(selection),
      label: overview.targetCatalog.envFallback.modelId,
      detail: '.env fallback',
      disambiguation: '.env fallback',
      selection,
    })
  }

  if (targetDraft) {
    const selectedValue = chatTargetSelectionKey(targetDraft)

    if (!options.some((option) => option.value === selectedValue)) {
      options.unshift({
        value: selectedValue,
        label: targetDraft.kind === 'connection' ? targetDraft.modelId : '.env fallback',
        detail:
          targetDraft.kind === 'connection'
            ? `${targetDraft.providerId} · Unavailable`
            : 'Unavailable',
        disambiguation:
          targetDraft.kind === 'connection' ? targetDraft.providerId : '.env fallback',
        selection: targetDraft,
        disabled: true,
      })
    }
  }

  return options
}

export function composerTargetPresentation({
  isResetting,
  hydrationStatus,
  connectionStatusKind,
  connectionRequestEpoch,
  targetInitialized,
  targetCatalogEpoch,
  hasTargetDraft,
  targetAvailable,
  availableOptionCount,
}: {
  isResetting: boolean
  hydrationStatus: 'loading' | 'ready' | 'error'
  connectionStatusKind: 'loading' | 'ready' | 'failed'
  connectionRequestEpoch: number
  targetInitialized: boolean
  targetCatalogEpoch: number
  hasTargetDraft: boolean
  targetAvailable: boolean
  availableOptionCount: number
}): ComposerTargetPresentation {
  if (isResetting) {
    return { status: 'Starting fresh…', disabled: true, action: null }
  }

  if (hydrationStatus === 'error' && !targetInitialized) {
    return { status: null, disabled: true, action: null }
  }

  if (connectionStatusKind === 'failed') {
    return {
      status: 'Couldn’t refresh targets.',
      disabled: !targetInitialized || availableOptionCount === 0,
      action: 'refresh',
    }
  }

  if (!targetInitialized) {
    return { status: 'Loading targets…', disabled: true, action: null }
  }

  if (
    connectionStatusKind === 'loading' ||
    (connectionStatusKind === 'ready' && connectionRequestEpoch > targetCatalogEpoch)
  ) {
    return {
      status: 'Refreshing targets…',
      disabled: availableOptionCount === 0,
      action: null,
    }
  }

  if (!hasTargetDraft) {
    return availableOptionCount > 0
      ? { status: 'Choose a target.', disabled: false, action: null }
      : { status: 'No target available.', disabled: true, action: 'connections' }
  }

  if (!targetAvailable) {
    return availableOptionCount > 0
      ? {
          status: 'Selected target unavailable. Choose another target.',
          disabled: false,
          action: null,
        }
      : {
          status: 'Selected target unavailable.',
          disabled: true,
          action: 'connections',
        }
  }

  return { status: null, disabled: false, action: null }
}

export function readSidebarCollapsed(storage?: Pick<Storage, 'getItem'>) {
  try {
    return storage?.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function isSidebarShortcut(event: SidebarShortcutInput, platform: string) {
  if (event.key.toLowerCase() !== 'b' || event.altKey || event.shiftKey || event.repeat) {
    return false
  }

  return platform === 'darwin' ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

function initialSidebarCollapsed() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return readSidebarCollapsed(window.localStorage)
  } catch {
    return false
  }
}

export function ChatWorkspace() {
  const [activeView, setActiveView] = useState<WorkspaceView>('chat')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed)
  const settingsPopoverRef = useRef<HTMLDivElement>(null)
  const sidebarContentRef = useRef<HTMLDivElement>(null)
  const sidebarToggleRef = useRef<HTMLButtonElement>(null)
  const retryOpenRef = useRef<HTMLButtonElement>(null)
  const connectionSetup = useConnectionStatus()
  const {
    state,
    threadCollection,
    threadPinAction,
    currentThreadSummary,
    isBusy,
    isAccepting,
    isResetting,
    canStartRun,
    canSend,
    capacityNotice,
    setInput,
    setTargetSelection,
    addDraftImages,
    addDraftDocuments,
    removeDraftImage,
    removeDraftDocument,
    retryDraftImage,
    retryDraftDocument,
    sendCurrentInput,
    retryMessage,
    stopActiveResponse,
    selectThread,
    startNewChat,
    retryOpen,
    loadMoreThreads,
    retryThreadCollection,
    updateThreadPin,
    renameThread,
  } = useChatSession({
    connectionStatus: connectionSetup.status,
    refreshConnections: connectionSetup.refresh,
    getLatestConnectionRequestEpoch: connectionSetup.getLatestRequestEpoch,
  })

  const targetOptions = useMemo(
    () => buildComposerTargetOptions(connectionSetup.status.overview, state.targetDraft),
    [connectionSetup.status.overview, state.targetDraft],
  )
  const targetPresentation = composerTargetPresentation({
    isResetting,
    hydrationStatus: state.hydrationStatus,
    connectionStatusKind: connectionSetup.status.kind,
    connectionRequestEpoch: connectionSetup.status.requestEpoch,
    targetInitialized: state.targetInitialized,
    targetCatalogEpoch: state.targetCatalogEpoch,
    hasTargetDraft: Boolean(state.targetDraft),
    targetAvailable: state.targetAvailable,
    availableOptionCount: targetOptions.filter((option) => !option.disabled).length,
  })

  const threadItems = useMemo(() => toThreadStreamItems(state.messages), [state.messages])
  const latestMessageItem = threadItems.at(-1)
  const currentThreadTitle =
    state.threadSummary?.title ??
    (state.hydrationError ? "Couldn't open Thread Library" : 'New thread')
  const currentThreadPreview = state.hydrationError ? '' : threadPreview(state.messages)
  const libraryUnavailable =
    state.hydrationStatus === 'error' && state.hydrationErrorThreadId === null
  const { containerRef, followLatest, handleScroll, isFollowing } = useAutoScroll(
    threadItems.length,
    latestMessageItem?.message.content ?? state.runStatus,
    state.projectionGeneration,
    activeView === 'chat',
  )

  const updateSidebarCollapsed = useCallback((collapsed: boolean) => {
    if (collapsed) {
      settingsPopoverRef.current?.hidePopover()

      const activeElement = document.activeElement

      if (activeElement && sidebarContentRef.current?.contains(activeElement)) {
        sidebarToggleRef.current?.focus()
      }
    }

    setSidebarCollapsed(collapsed)

    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed))
    } catch {
      // A blocked UI preference should not block the workspace.
    }
  }, [])

  const toggleSidebar = useCallback(() => {
    updateSidebarCollapsed(!sidebarCollapsed)
  }, [sidebarCollapsed, updateSidebarCollapsed])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isSidebarShortcut(event, window.nyx?.platform ?? 'unknown')) {
        return
      }

      event.preventDefault()
      toggleSidebar()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [toggleSidebar])

  useEffect(() => {
    if (activeView === 'chat' && state.hydrationStatus === 'error' && !state.hydrationRetrying) {
      retryOpenRef.current?.focus()
    }
  }, [activeView, state.hydrationError, state.hydrationRetrying, state.hydrationStatus])

  function handleSend() {
    if (!canSend) {
      return
    }

    followLatest()
    return sendCurrentInput()
  }

  function handleRetry(messageId: string) {
    const settlementRetry = state.settlementFailure?.assistantMessageId === messageId
    if (
      state.hydrationStatus !== 'ready' ||
      isBusy ||
      isResetting ||
      (!settlementRetry && !canStartRun) ||
      (state.retryableTurn?.assistantMessageId !== messageId && !settlementRetry)
    ) {
      return
    }

    followLatest()
    void retryMessage(messageId)
  }

  return (
    <main
      className={`relative h-screen overflow-hidden bg-nyx-canvas text-nyx-ink ${
        sidebarCollapsed ? 'sidebar-is-collapsed' : ''
      }`}
    >
      <button
        aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        className='sidebar-toggle z-20 flex h-7 w-7 items-center justify-center rounded-lg text-nyx-muted hover:bg-nyx-solid hover:text-nyx-ink'
        onClick={toggleSidebar}
        ref={sidebarToggleRef}
        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        type='button'
      >
        <PanelLeft aria-hidden='true' className='h-4 w-4' strokeWidth={1.75} />
      </button>

      <div className='flex h-full w-full'>
        <div
          aria-hidden={sidebarCollapsed || undefined}
          className={`sidebar-shell shrink-0 overflow-hidden ${
            sidebarCollapsed ? 'w-0' : 'w-[16.5rem]'
          }`}
          inert={sidebarCollapsed || undefined}
          ref={sidebarContentRef}
        >
          <ChatSidebar
            activeView={activeView}
            collection={threadCollection}
            currentThread={currentThreadSummary}
            currentThreadStatus={currentThreadSidebarStatus(
              state.runStatus,
              state.settlementFailure !== null,
            )}
            libraryUnavailable={libraryUnavailable}
            pinAction={threadPinAction}
            newThreadDisabled={state.hydrationStatus !== 'ready' || isResetting}
            onNewThread={() => {
              void startNewChat()
              setActiveView('chat')
            }}
            onSelectThread={(threadId) => {
              void selectThread(threadId)
              setActiveView('chat')
            }}
            onUpdateThreadPin={(threadId, action, expectedPinPosition) => {
              void updateThreadPin({ threadId, action, expectedPinPosition })
            }}
            onRenameThread={(threadId, title, expectedThreadRevision) =>
              renameThread({ threadId, title, expectedThreadRevision })
            }
            onOpenConnectionsSettings={() => {
              settingsPopoverRef.current?.hidePopover()
              setActiveView('connections')
            }}
            onLoadMoreThreads={() => {
              void loadMoreThreads()
            }}
            onRetryThreadCollection={retryThreadCollection}
            preview={currentThreadPreview}
            selectedThreadId={state.selectedThreadId}
            settingsPopoverRef={settingsPopoverRef}
            title={currentThreadTitle}
          />
        </div>

        <section className='flex min-h-0 min-w-0 flex-1 flex-col bg-nyx-canvas'>
          {activeView === 'chat' ? (
            <>
              <ChatHeader
                connectionStatus={connectionSetup.status}
                runStatus={state.runStatus}
                title={currentThreadTitle}
              />
              {state.hydrationStatus === 'error' ? (
                <div className='flex min-h-0 flex-1 items-center'>
                  <section
                    className='mx-auto w-full max-w-[40rem] space-y-3 px-6'
                    aria-live='polite'
                  >
                    <p className='text-[12px] font-medium text-nyx-danger'>
                      {state.hydrationErrorThreadId
                        ? 'Thread unavailable'
                        : 'Thread Library unavailable'}
                    </p>
                    <h2 className='text-[22px] font-semibold text-nyx-ink'>
                      {state.hydrationErrorThreadId
                        ? "Couldn't open this thread"
                        : "Couldn't open Thread Library"}
                    </h2>
                    <button
                      className='rounded-lg bg-nyx-accent px-3 py-2 text-[13px] font-medium text-nyx-canvas disabled:opacity-50'
                      disabled={state.hydrationRetrying}
                      onClick={() => void retryOpen()}
                      ref={retryOpenRef}
                      type='button'
                    >
                      {state.hydrationRetrying ? 'Retrying…' : 'Retry'}
                    </button>
                  </section>
                </div>
              ) : (
                <ChatThread
                  connectionStatus={connectionSetup.status}
                  hydrationError={null}
                  hydrationStatus={state.hydrationStatus}
                  isFollowing={isFollowing}
                  resetError={null}
                  containerRef={containerRef}
                  items={threadItems}
                  onJumpToLatest={followLatest}
                  onOpenConnectionsSettings={() => {
                    setActiveView('connections')
                  }}
                  onRefreshConnectionStatus={connectionSetup.refresh}
                  onRetry={handleRetry}
                  onScroll={handleScroll}
                />
              )}
              {state.hydrationStatus === 'error' ? null : (
                <ChatComposer
                  canSend={canSend}
                  composerError={state.composerError}
                  composerNotice={state.composerNotice ?? capacityNotice}
                  disabled={state.hydrationStatus !== 'ready' || isResetting}
                  draftDocuments={state.draftDocuments}
                  draftImages={state.draftImages}
                  input={state.input}
                  isAccepting={isAccepting}
                  isBusy={isBusy}
                  onAddImages={addDraftImages}
                  onAddDocuments={addDraftDocuments}
                  onInputChange={setInput}
                  onRemoveImage={removeDraftImage}
                  onRemoveDocument={removeDraftDocument}
                  onRetryImage={retryDraftImage}
                  onRetryDocument={retryDraftDocument}
                  targetAction={
                    targetPresentation.action === 'refresh'
                      ? {
                          label: 'Refresh targets',
                          run: () => {
                            void connectionSetup.refresh()
                          },
                        }
                      : targetPresentation.action === 'connections'
                        ? {
                            label: 'Open Connections',
                            run: () => {
                              setActiveView('connections')
                            },
                          }
                        : null
                  }
                  onTargetChange={(value) => {
                    const option = targetOptions.find((candidate) => candidate.value === value)

                    if (option) {
                      setTargetSelection(option.selection)
                    }
                  }}
                  onSend={handleSend}
                  onStop={stopActiveResponse}
                  targetDisabled={targetPresentation.disabled}
                  targetOptions={targetOptions}
                  targetStatus={targetPresentation.status}
                  targetValue={state.targetDraft ? chatTargetSelectionKey(state.targetDraft) : ''}
                />
              )}
            </>
          ) : (
            <ConnectionsSettingsPage
              onBackToChat={() => {
                setActiveView('chat')
              }}
              onConnectionsChanged={connectionSetup.refresh}
            />
          )}
        </section>
      </div>
    </main>
  )
}
