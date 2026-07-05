import { describe, expect, it } from 'vitest'

import { resolveUpdateFeed, resolveUpdateIdentity } from './config'

describe('resolveUpdateIdentity', () => {
  it('keeps dev and production update identities isolated by product name', () => {
    expect(resolveUpdateIdentity('Nyx Dev')).toEqual({
      appId: 'dev.dbvc.nyx',
      channel: 'dev',
      feedEnvVar: 'NYX_DEV_UPDATE_FEED_URL',
      productName: 'Nyx Dev',
    })
    expect(resolveUpdateIdentity('Nyx')).toEqual({
      appId: 'com.dbvc.nyx',
      channel: 'latest',
      feedEnvVar: 'NYX_PROD_UPDATE_FEED_URL',
      productName: 'Nyx',
    })
  })
})

describe('resolveUpdateFeed', () => {
  it('disables auto update outside packaged app mode', () => {
    expect(
      resolveUpdateFeed({
        appName: 'Nyx',
        env: {
          NYX_PROD_UPDATE_FEED_URL: 'https://updates.example.test/nyx/prod',
        },
        isPackaged: false,
      }),
    ).toEqual({
      status: 'disabled',
      reason: 'not_packaged',
    })
  })

  it('uses only the matching dev feed environment variable for Nyx Dev', () => {
    expect(
      resolveUpdateFeed({
        appName: 'Nyx Dev',
        env: {
          NYX_DEV_UPDATE_FEED_URL: ' https://updates.example.test/nyx/dev/ ',
          NYX_PROD_UPDATE_FEED_URL: 'https://updates.example.test/nyx/prod',
        },
        isPackaged: true,
      }),
    ).toEqual({
      status: 'enabled',
      identity: {
        appId: 'dev.dbvc.nyx',
        channel: 'dev',
        feedEnvVar: 'NYX_DEV_UPDATE_FEED_URL',
        productName: 'Nyx Dev',
      },
      source: 'environment',
      url: 'https://updates.example.test/nyx/dev',
    })
  })

  it('uses only the matching production feed environment variable for Nyx', () => {
    expect(
      resolveUpdateFeed({
        appName: 'Nyx',
        env: {
          NYX_DEV_UPDATE_FEED_URL: 'https://updates.example.test/nyx/dev',
          NYX_PROD_UPDATE_FEED_URL: 'https://updates.example.test/nyx/prod',
        },
        isPackaged: true,
      }),
    ).toEqual({
      status: 'enabled',
      identity: {
        appId: 'com.dbvc.nyx',
        channel: 'latest',
        feedEnvVar: 'NYX_PROD_UPDATE_FEED_URL',
        productName: 'Nyx',
      },
      source: 'environment',
      url: 'https://updates.example.test/nyx/prod',
    })
  })

  it('disables auto update when dev and production feed URLs are not isolated', () => {
    expect(
      resolveUpdateFeed({
        appName: 'Nyx',
        env: {
          NYX_DEV_UPDATE_FEED_URL: 'https://updates.example.test/nyx/shared/',
          NYX_PROD_UPDATE_FEED_URL: ' https://updates.example.test/nyx/shared ',
        },
        isPackaged: true,
      }),
    ).toEqual({
      status: 'disabled',
      identity: {
        appId: 'com.dbvc.nyx',
        channel: 'latest',
        feedEnvVar: 'NYX_PROD_UPDATE_FEED_URL',
        productName: 'Nyx',
      },
      reason: 'feed_urls_not_isolated',
    })
  })

  it('can use packaged app-update.yml when builder generated one', () => {
    expect(
      resolveUpdateFeed({
        appName: 'Nyx',
        env: {},
        hasPackagedUpdateConfig: true,
        isPackaged: true,
      }),
    ).toEqual({
      status: 'enabled',
      identity: {
        appId: 'com.dbvc.nyx',
        channel: 'latest',
        feedEnvVar: 'NYX_PROD_UPDATE_FEED_URL',
        productName: 'Nyx',
      },
      source: 'packaged-config',
    })
  })

  it('disables auto update when a packaged app has no feed source', () => {
    expect(
      resolveUpdateFeed({
        appName: 'Nyx Dev',
        env: {},
        hasPackagedUpdateConfig: false,
        isPackaged: true,
      }),
    ).toEqual({
      status: 'disabled',
      identity: {
        appId: 'dev.dbvc.nyx',
        channel: 'dev',
        feedEnvVar: 'NYX_DEV_UPDATE_FEED_URL',
        productName: 'Nyx Dev',
      },
      reason: 'feed_url_missing',
    })
  })
})
