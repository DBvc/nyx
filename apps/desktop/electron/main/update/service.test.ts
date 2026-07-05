import { describe, expect, it, vi } from 'vitest'

vi.mock('electron-updater', () => ({
  autoUpdater: {},
}))

import { configureMainAutoUpdate } from './service'

function createUpdater() {
  let channel: string | null = null
  const updater = {
    allowDowngrade: true,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(() => Promise.resolve(null)),
    logger: null,
    on: vi.fn(),
    setFeedURL: vi.fn(),
    get channel() {
      return channel
    },
    set channel(value: string | null) {
      channel = value
      updater.allowDowngrade = true
    },
  }

  return updater
}

function createLogger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
}

describe('configureMainAutoUpdate', () => {
  it('does not touch the updater outside packaged mode', () => {
    const updater = createUpdater()
    const logger = createLogger()

    const resolution = configureMainAutoUpdate({
      appName: 'Nyx',
      env: {
        NYX_PROD_UPDATE_FEED_URL: 'https://updates.example.test/nyx/prod',
      },
      fileExists: () => false,
      isPackaged: false,
      logger,
      resourcesPath: '/Nyx.app/Contents/Resources',
      updater,
    })

    expect(resolution).toEqual({
      status: 'disabled',
      reason: 'not_packaged',
    })
    expect(updater.setFeedURL).not.toHaveBeenCalled()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('configures the dev feed without reading the production feed', () => {
    const updater = createUpdater()

    const resolution = configureMainAutoUpdate({
      appName: 'Nyx Dev',
      env: {
        NYX_DEV_UPDATE_FEED_URL: 'https://updates.example.test/nyx/dev',
        NYX_PROD_UPDATE_FEED_URL: 'https://updates.example.test/nyx/prod',
      },
      fileExists: () => false,
      isPackaged: true,
      logger: createLogger(),
      resourcesPath: '/Nyx Dev.app/Contents/Resources',
      updater,
    })

    expect(resolution.status).toBe('enabled')
    expect(updater.channel).toBe('dev')
    expect(updater.allowDowngrade).toBe(false)
    expect(updater.autoDownload).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(updater.setFeedURL).toHaveBeenCalledWith({
      channel: 'dev',
      provider: 'generic',
      url: 'https://updates.example.test/nyx/dev',
    })
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  })

  it('can use packaged app-update.yml without overriding the feed URL', () => {
    const updater = createUpdater()

    const resolution = configureMainAutoUpdate({
      appName: 'Nyx',
      env: {},
      fileExists: (path) => path === '/Nyx.app/Contents/Resources/app-update.yml',
      isPackaged: true,
      logger: createLogger(),
      resourcesPath: '/Nyx.app/Contents/Resources',
      updater,
    })

    expect(resolution.status).toBe('enabled')
    expect(updater.channel).toBe('latest')
    expect(updater.setFeedURL).not.toHaveBeenCalled()
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  })

  it('stays disabled for packaged apps with no feed source', () => {
    const updater = createUpdater()

    const resolution = configureMainAutoUpdate({
      appName: 'Nyx',
      env: {},
      fileExists: () => false,
      isPackaged: true,
      logger: createLogger(),
      resourcesPath: '/Nyx.app/Contents/Resources',
      updater,
    })

    expect(resolution).toEqual({
      status: 'disabled',
      identity: {
        appId: 'com.dbvc.nyx',
        channel: 'latest',
        feedEnvVar: 'NYX_PROD_UPDATE_FEED_URL',
        productName: 'Nyx',
      },
      reason: 'feed_url_missing',
    })
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })
})
