import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let browserWindow
const rendererErrors = []
let temporaryDirectory
let viteServer

function browserTestHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws:; worker-src 'self' blob:" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body><div id="root"></div><script type="module" src="/src/ui/chat/components/ChatSidebar.browser-test.tsx"></script></body>
</html>`
}

async function evaluate(source) {
  return browserWindow.webContents.executeJavaScript(source, true)
}

async function waitFor(source, message, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await evaluate(source)) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25))
  }
  throw new Error(message)
}

async function runBrowserTest() {
  console.log('Starting Thread actions browser test server…')
  viteServer = await createServer({
    appType: 'custom',
    cacheDir: join(temporaryDirectory, 'vite-cache'),
    configFile: false,
    logLevel: 'error',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'thread-actions-browser-test-html',
        configureServer(server) {
          server.middlewares.use('/thread-actions-browser-test.html', async (request, response) => {
            const html = await server.transformIndexHtml(request.originalUrl, browserTestHtml())
            response.statusCode = 200
            response.setHeader('Content-Type', 'text/html; charset=utf-8')
            response.end(html)
          })
        },
      },
    ],
    root: desktopRoot,
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  await viteServer.listen()
  console.log('Thread actions browser test server is ready.')

  const address = viteServer.httpServer?.address()
  assert(address && typeof address === 'object', 'Vite did not expose a local test address')

  const { BrowserWindow } = await import('electron')
  browserWindow = new BrowserWindow({
    height: 480,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    width: 420,
  })
  browserWindow.webContents.on('console-message', (event) => {
    if (event.level === 'error') rendererErrors.push(event.message)
  })
  console.log('Loading Thread actions browser fixture…')
  await browserWindow.loadURL(`http://127.0.0.1:${address.port}/thread-actions-browser-test.html`)
  await waitFor(
    `document.documentElement.dataset.threadActionsBrowserTestReady === 'true'`,
    'Thread actions browser fixture did not render',
  )
  console.log('Thread actions browser fixture is ready.')

  const siblingControls = await evaluate(`(() => {
    const trigger = document.querySelector('[aria-label="Actions for Recent 1"]')
    const selection = trigger?.parentElement?.querySelector('[aria-current="page"]')
    return Boolean(trigger && selection && trigger.parentElement === selection.parentElement)
  })()`)
  assert.equal(siblingControls, true, 'Selection and actions trigger must remain siblings')

  const hiddenOpacity = await evaluate(
    `getComputedStyle(document.querySelector('[aria-label="Actions for Recent 2"]')).opacity`,
  )
  assert.equal(hiddenOpacity, '0', 'A non-selected trigger should start visually hidden')
  await evaluate(`document.querySelector('[aria-label="Actions for Recent 2"]').focus()`)
  await waitFor(
    `getComputedStyle(document.querySelector('[aria-label="Actions for Recent 2"]')).opacity === '1'`,
    'Keyboard focus did not reveal the non-selected trigger',
  )

  await evaluate(`document.querySelector('[aria-label="Actions for Recent 2"]').click()`)
  await waitFor(
    `document.querySelector('#thread-actions-recent-2')?.matches(':popover-open') && document.activeElement?.textContent?.trim() === 'Rename'`,
    'Opening the Popover did not focus its first enabled action',
  )

  browserWindow.webContents.sendInputEvent({ keyCode: 'Escape', type: 'keyDown' })
  browserWindow.webContents.sendInputEvent({ keyCode: 'Escape', type: 'keyUp' })
  await waitFor(
    `!document.querySelector('#thread-actions-recent-2')?.matches(':popover-open') && document.activeElement?.getAttribute('aria-label') === 'Actions for Recent 2'`,
    'Escape did not close the Popover and return focus to its trigger',
  )

  await evaluate(`document.querySelector('[aria-label="Actions for Recent 2"]').click()`)
  await waitFor(
    `document.querySelector('#thread-actions-recent-2')?.matches(':popover-open')`,
    'Popover did not reopen before action dispatch',
  )
  await evaluate(
    `Array.from(document.querySelectorAll('#thread-actions-recent-2 button')).find((button) => button.textContent?.trim() === 'Pin').click()`,
  )
  await waitFor(
    `!document.querySelector('#thread-actions-recent-2')?.matches(':popover-open')`,
    'Invoking an action did not close the Popover',
  )
  const actionState = await evaluate(`window.__nyxThreadActionsBrowserTest`)
  assert.deepEqual(actionState.pinActions, [{ action: 'pin', threadId: 'recent-2' }])
  assert.deepEqual(actionState.selections, [], 'Action controls must not select their Thread')

  await evaluate(`new Promise((resolveFrame) => {
    const trigger = document.querySelector('[aria-label="Actions for Recent 14"]')
    trigger.scrollIntoView({ block: 'end' })
    requestAnimationFrame(() => requestAnimationFrame(resolveFrame))
  })`)
  await evaluate(`document.querySelector('[aria-label="Actions for Recent 14"]').click()`)
  await waitFor(
    `document.querySelector('#thread-actions-recent-14')?.matches(':popover-open')`,
    'Last-row Popover did not open',
  )
  const placement = await evaluate(`(() => {
    const rect = document.querySelector('#thread-actions-recent-14').getBoundingClientRect()
    return { bottom: rect.bottom, height: innerHeight, left: rect.left, right: rect.right, width: innerWidth, top: rect.top }
  })()`)
  assert(placement.top >= 0 && placement.bottom <= placement.height, 'Popover escaped vertically')
  assert(placement.left >= 0 && placement.right <= placement.width, 'Popover escaped horizontally')
  assert.deepEqual(rendererErrors, [], 'Renderer logged an error during the browser test')

  console.log('Thread actions browser test passed.')
}

async function runElectronChild(app, receiptPath) {
  console.log('Electron is ready.')
  let receipt = 'failed: browser test did not complete'
  try {
    await runBrowserTest()
    receipt = 'passed'
  } catch (error) {
    console.error(error)
    receipt = `failed: ${error instanceof Error ? error.stack : String(error)}`
  } finally {
    await viteServer?.close()
    browserWindow?.destroy()
    await writeFile(receiptPath, receipt, 'utf8')
    app.exit(0)
  }
}

async function runNodeParent() {
  const wrapperDirectory = await mkdtemp(join(tmpdir(), 'nyx-thread-actions-browser-wrapper-'))
  const electronDirectory = join(wrapperDirectory, 'electron')
  const receiptPath = join(wrapperDirectory, 'result.txt')
  const electronExecutable = (await import('electron')).default
  const childEnvironment = {
    ...process.env,
    NYX_THREAD_ACTIONS_BROWSER_RECEIPT: receiptPath,
    NYX_THREAD_ACTIONS_BROWSER_TEMP: electronDirectory,
  }
  delete childEnvironment.ELECTRON_RUN_AS_NODE

  try {
    await mkdir(electronDirectory)
    const childResult = await new Promise((resolveChild) => {
      const child = spawn(electronExecutable, [fileURLToPath(import.meta.url)], {
        env: childEnvironment,
        stdio: 'inherit',
      })
      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
      }, 20_000)
      child.on('close', (code, signal) => {
        clearTimeout(timeout)
        resolveChild({ code, signal, timedOut })
      })
    })
    const receipt = await readFile(receiptPath, 'utf8').catch(() => null)
    if (
      childResult.code !== 0 ||
      childResult.signal ||
      childResult.timedOut ||
      receipt !== 'passed'
    ) {
      console.error(receipt ?? 'Thread actions browser test exited without a result.')
      process.exitCode = 1
    }
  } finally {
    await rm(wrapperDirectory, { force: true, recursive: true })
  }
}

if (process.versions.electron) {
  const { app } = await import('electron')
  const receiptPath = process.env.NYX_THREAD_ACTIONS_BROWSER_RECEIPT
  temporaryDirectory = process.env.NYX_THREAD_ACTIONS_BROWSER_TEMP
  assert(receiptPath, 'Browser test receipt path is required')
  assert(temporaryDirectory, 'Browser test temporary directory is required')
  app.setPath('userData', join(temporaryDirectory, 'user-data'))
  app.on('window-all-closed', () => undefined)
  console.log('Waiting for Electron…')
  void app.whenReady().then(() => runElectronChild(app, receiptPath))
} else {
  await runNodeParent()
}
