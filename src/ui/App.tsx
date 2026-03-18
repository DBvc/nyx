const quickPreviewConversations = [
  "Bootstrapping Nyx v0",
  "Model selection draft",
  "Provider adapter sketch",
];

export function App() {
  const desktopApi = window.nyx;

  if (!desktopApi) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-nyx-canvas px-6 py-12 text-nyx-ink">
        <section className="w-full max-w-2xl rounded-[2rem] border border-rose-300/70 bg-white/90 p-8 shadow-[0_24px_64px_rgba(36,26,16,0.08)] backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-rose-700">Startup error</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
            Nyx desktop bridge is unavailable
          </h1>
          <p className="mt-4 text-sm leading-7 text-nyx-muted">
            The renderer started, but the preload bridge did not expose
            <code className="mx-1 rounded bg-nyx-panel px-2 py-1 text-xs text-nyx-ink">
              window.nyx
            </code>
            as expected. This usually means the preload script failed to execute or was built with
            an incompatible output format.
          </p>
          <div className="mt-6 rounded-[1.5rem] border border-dashed border-rose-300/80 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-900">
            Check the Electron preload build output, then restart the app. We fail explicitly here
            so bridge regressions do not silently look like valid runtime data.
          </div>
        </section>
      </main>
    );
  }

  const { platform, versions } = desktopApi;

  return (
    <main className="min-h-screen bg-nyx-canvas text-nyx-ink">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-6 py-6">
        <aside className="flex w-80 flex-col rounded-[2rem] border border-nyx-line bg-nyx-panel/90 p-5 shadow-[0_16px_40px_rgba(38,28,17,0.08)] backdrop-blur">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.3em] text-nyx-muted">Nyx</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">v0 bootstrap</h1>
            <p className="mt-3 text-sm leading-6 text-nyx-muted">
              Electron shell, React renderer, Router, Tailwind tokens, and the first shared boundary
              are now wired together.
            </p>
          </div>

          <section className="rounded-[1.5rem] bg-nyx-panel-strong px-4 py-4">
            <p className="text-xs uppercase tracking-[0.25em] text-nyx-muted">Conversations</p>
            <ul className="mt-4 space-y-2">
              {quickPreviewConversations.map((conversation, index) => (
                <li
                  key={conversation}
                  className={`rounded-2xl border px-3 py-3 text-sm transition ${
                    index === 0
                      ? "border-nyx-accent/30 bg-nyx-accent/10 text-nyx-ink"
                      : "border-transparent bg-nyx-canvas/60 text-nyx-muted"
                  }`}
                >
                  {conversation}
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-auto rounded-[1.5rem] border border-dashed border-nyx-line px-4 py-4">
            <p className="text-xs uppercase tracking-[0.25em] text-nyx-muted">Runtime</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-nyx-muted">Platform</dt>
                <dd className="font-medium">{platform}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-nyx-muted">Electron</dt>
                <dd className="font-medium">{versions.electron}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-nyx-muted">Node</dt>
                <dd className="font-medium">{versions.node}</dd>
              </div>
            </dl>
          </div>
        </aside>

        <section className="flex min-h-[calc(100vh-3rem)] flex-1 flex-col rounded-[2rem] border border-nyx-line bg-white/80 p-6 shadow-[0_24px_64px_rgba(36,26,16,0.08)] backdrop-blur">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-nyx-line/80 pb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-nyx-muted">
                General Chat Foundation
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">
                One vertical slice at a time
              </h2>
            </div>

            <div className="rounded-full border border-nyx-line bg-nyx-panel px-4 py-2 text-sm text-nyx-muted">
              Router + preload bridge + shared contract
            </div>
          </header>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <article className="rounded-[1.75rem] bg-nyx-panel px-5 py-5">
              <p className="text-xs uppercase tracking-[0.25em] text-nyx-muted">What exists now</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-nyx-muted">
                <li>Electron main and preload entrypoints are connected.</li>
                <li>React Router owns renderer navigation from the start.</li>
                <li>Tailwind v4 is loaded through the Vite plugin path.</li>
                <li>The first typed desktop bridge is exposed through preload.</li>
                <li>TypeScript is split into renderer and node-focused configs.</li>
              </ul>
            </article>

            <article className="rounded-[1.75rem] bg-nyx-panel-strong px-5 py-5">
              <p className="text-xs uppercase tracking-[0.25em] text-nyx-muted">Next up</p>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-nyx-muted">
                <li>Define typed IPC contracts for app actions.</li>
                <li>Introduce the first SQLite schema and repository layer.</li>
                <li>Build the provider adapter and streaming event model.</li>
                <li>Replace the placeholder shell with the first chat flow.</li>
              </ol>
            </article>
          </div>

          <div className="mt-auto pt-6">
            <div className="rounded-[1.75rem] border border-nyx-line bg-[linear-gradient(135deg,rgba(199,97,72,0.12),rgba(255,255,255,0.6))] px-5 py-5">
              <p className="text-xs uppercase tracking-[0.25em] text-nyx-muted">Why this matters</p>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-nyx-muted">
                This is intentionally not a feature-heavy first pass. The goal is to lock down the
                shell, toolchain, and boundaries so the next iteration can focus on conversations,
                messages, persistence, and provider integration without rethinking the project
                skeleton.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
