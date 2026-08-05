import { ChatWorkspace } from './chat/components/ChatWorkspace'

export function App() {
  const desktopApi = window.nyx

  if (!desktopApi) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-nyx-canvas px-6 py-12 text-nyx-ink'>
        <section className='w-full max-w-xl rounded-xl border border-nyx-danger/35 bg-nyx-danger-soft px-6 py-6'>
          <p className='text-xs font-medium text-nyx-danger'>Startup error</p>
          <h1 className='mt-2 text-xl font-semibold'>Nyx desktop bridge is unavailable</h1>
          <p className='mt-3 text-sm leading-6 text-nyx-muted'>
            The renderer started, but the preload bridge did not expose
            <code className='mx-1 rounded bg-nyx-solid px-1.5 py-0.5 text-xs text-nyx-ink'>
              window.nyx
            </code>
            as expected.
          </p>
        </section>
      </main>
    )
  }

  return <ChatWorkspace />
}
