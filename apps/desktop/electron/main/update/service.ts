import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { autoUpdater } from 'electron-updater'

import { resolveUpdateFeed, type UpdateFeedResolution } from './config'

interface Logger {
  error(message?: unknown): void
  info(message?: unknown): void
  warn(message?: unknown): void
}

interface UpdaterClient {
  allowDowngrade: boolean
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  channel: string | null
  checkForUpdates(): Promise<unknown>
  logger: Logger | null
  on(event: 'error', handler: (error: Error) => void): unknown
  setFeedURL(options: { channel: string; provider: 'generic'; url: string }): void
}

export interface ConfigureMainAutoUpdateOptions {
  appName: string
  env?: NodeJS.ProcessEnv
  fileExists?: (path: string) => boolean
  isPackaged: boolean
  logger?: Logger
  resourcesPath: string
  updater?: UpdaterClient
}

function createUpdaterLogger(logger: Logger): Logger {
  return {
    error(message?: unknown) {
      logger.error(`[auto-update] ${String(message)}`)
    },
    info(message?: unknown) {
      logger.info(`[auto-update] ${String(message)}`)
    },
    warn(message?: unknown) {
      logger.warn(`[auto-update] ${String(message)}`)
    },
  }
}

function logDisabled(
  logger: Logger,
  resolution: Extract<UpdateFeedResolution, { status: 'disabled' }>,
) {
  const identity = resolution.identity ? ` identity=${resolution.identity.appId}` : ''
  logger.info(`[auto-update] disabled reason=${resolution.reason}${identity}`)
}

export function configureMainAutoUpdate({
  appName,
  env = process.env,
  fileExists = existsSync,
  isPackaged,
  logger = console,
  resourcesPath,
  updater = autoUpdater,
}: ConfigureMainAutoUpdateOptions): UpdateFeedResolution {
  const appUpdateConfigPath = join(resourcesPath, 'app-update.yml')
  const resolution = resolveUpdateFeed({
    appName,
    env,
    hasPackagedUpdateConfig: fileExists(appUpdateConfigPath),
    isPackaged,
  })

  if (resolution.status === 'disabled') {
    logDisabled(logger, resolution)
    return resolution
  }

  updater.logger = createUpdaterLogger(logger)
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.channel = resolution.identity.channel
  updater.allowDowngrade = false

  if (resolution.source === 'environment') {
    updater.setFeedURL({
      channel: resolution.identity.channel,
      provider: 'generic',
      url: resolution.url,
    })
  }

  updater.on('error', (error) => {
    logger.warn(`[auto-update] check failed: ${error.message}`)
  })

  void updater.checkForUpdates().catch((error: unknown) => {
    logger.warn(
      `[auto-update] check failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  })

  logger.info(
    `[auto-update] enabled identity=${resolution.identity.appId} channel=${resolution.identity.channel} source=${resolution.source}`,
  )

  return resolution
}
