export type UpdateFlavor = 'dev' | 'prod'

export interface UpdateIdentity {
  appId: string
  channel: string
  feedEnvVar: string
  productName: string
}

export const UPDATE_IDENTITIES = {
  dev: {
    appId: 'dev.dbvc.nyx',
    channel: 'dev',
    feedEnvVar: 'NYX_DEV_UPDATE_FEED_URL',
    productName: 'Nyx Dev',
  },
  prod: {
    appId: 'com.dbvc.nyx',
    channel: 'latest',
    feedEnvVar: 'NYX_PROD_UPDATE_FEED_URL',
    productName: 'Nyx',
  },
} as const satisfies Record<UpdateFlavor, UpdateIdentity>

export type UpdateFeedResolution =
  | {
      status: 'enabled'
      identity: UpdateIdentity
      source: 'environment'
      url: string
    }
  | {
      status: 'enabled'
      identity: UpdateIdentity
      source: 'packaged-config'
    }
  | {
      status: 'disabled'
      reason: 'feed_urls_not_isolated' | 'feed_url_missing' | 'not_packaged' | 'unknown_identity'
      identity?: UpdateIdentity
    }

export interface ResolveUpdateFeedOptions {
  appName: string
  env?: NodeJS.ProcessEnv
  hasPackagedUpdateConfig?: boolean
  isPackaged: boolean
}

export function normalizeFeedUrl(value: string | undefined) {
  const trimmed = value?.trim()

  if (!trimmed) {
    return null
  }

  return trimmed.replace(/\/+$/, '')
}

function updateFeedUrlsAreIsolated(env: NodeJS.ProcessEnv) {
  const devFeedUrl = normalizeFeedUrl(env.NYX_DEV_UPDATE_FEED_URL)
  const prodFeedUrl = normalizeFeedUrl(env.NYX_PROD_UPDATE_FEED_URL)

  return !devFeedUrl || !prodFeedUrl || devFeedUrl !== prodFeedUrl
}

export function resolveUpdateIdentity(appName: string) {
  return (
    Object.values(UPDATE_IDENTITIES).find((identity) => identity.productName === appName) ?? null
  )
}

export function resolveUpdateFeed({
  appName,
  env = process.env,
  hasPackagedUpdateConfig = false,
  isPackaged,
}: ResolveUpdateFeedOptions): UpdateFeedResolution {
  if (!isPackaged) {
    return {
      status: 'disabled',
      reason: 'not_packaged',
    }
  }

  const identity = resolveUpdateIdentity(appName)

  if (!identity) {
    return {
      status: 'disabled',
      reason: 'unknown_identity',
    }
  }

  const feedUrl = normalizeFeedUrl(env[identity.feedEnvVar])

  if (!updateFeedUrlsAreIsolated(env)) {
    return {
      status: 'disabled',
      reason: 'feed_urls_not_isolated',
      identity,
    }
  }

  if (feedUrl) {
    return {
      status: 'enabled',
      identity,
      source: 'environment',
      url: feedUrl,
    }
  }

  if (hasPackagedUpdateConfig) {
    return {
      status: 'enabled',
      identity,
      source: 'packaged-config',
    }
  }

  return {
    status: 'disabled',
    reason: 'feed_url_missing',
    identity,
  }
}
