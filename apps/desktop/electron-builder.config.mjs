function readPackageFlavor() {
  const flavor = process.env.NYX_PACKAGE_FLAVOR ?? 'dev'

  if (flavor === 'dev' || flavor === 'prod') {
    return flavor
  }

  throw new Error(`Unsupported NYX_PACKAGE_FLAVOR: ${flavor}`)
}

const packageFlavor = readPackageFlavor()
const isProduction = packageFlavor === 'prod'
function readFeedUrl(envVar) {
  return process.env[envVar]?.trim().replace(/\/+$/, '') || null
}

function assertFeedUrlIsolation() {
  const devFeedUrl = readFeedUrl('NYX_DEV_UPDATE_FEED_URL')
  const prodFeedUrl = readFeedUrl('NYX_PROD_UPDATE_FEED_URL')

  if (devFeedUrl && prodFeedUrl && devFeedUrl === prodFeedUrl) {
    throw new Error('NYX_DEV_UPDATE_FEED_URL and NYX_PROD_UPDATE_FEED_URL must not point at the same update feed')
  }
}

const identities = {
  dev: {
    appId: 'dev.dbvc.nyx',
    productName: 'Nyx Dev',
    artifactPrefix: 'nyx-dev',
    updateChannel: 'dev',
    updateFeedEnv: 'NYX_DEV_UPDATE_FEED_URL',
  },
  prod: {
    appId: 'com.dbvc.nyx',
    productName: 'Nyx',
    artifactPrefix: 'nyx',
    updateChannel: 'latest',
    updateFeedEnv: 'NYX_PROD_UPDATE_FEED_URL',
  },
}
const identity = identities[packageFlavor]
const artifactName = `${identity.artifactPrefix}-\${version}-mac-arm64.\${ext}`
assertFeedUrlIsolation()
const updateFeedUrl = readFeedUrl(identity.updateFeedEnv)
const publishConfig = updateFeedUrl
  ? [
      {
        provider: 'generic',
        url: updateFeedUrl,
        channel: identity.updateChannel,
      },
    ]
  : null
const macSigningConfig = isProduction
  ? {
      ...(process.env.CSC_NAME ? { identity: process.env.CSC_NAME } : {}),
      entitlements: 'build/entitlements.mac.plist',
      entitlementsInherit: 'build/entitlements.mac.inherit.plist',
      forceCodeSigning: true,
      hardenedRuntime: true,
      notarize: true,
      strictVerify: true,
    }
  : {
      identity: null,
      notarize: false,
    }

export default {
  appId: identity.appId,
  productName: identity.productName,
  asar: true,
  artifactName,
  directories: {
    output: `dist/mac-${packageFlavor}`,
  },
  files: ['out/main/**/*', 'out/preload/**/*', 'out/renderer/**/*', 'package.json'],
  extraResources: [
    {
      from: '.package-resources/runtime/nyx-runtime',
      to: 'runtime/nyx-runtime',
    },
  ],
  mac: {
    category: 'public.app-category.developer-tools',
    detectUpdateChannel: false,
    generateUpdatesFilesForAllChannels: false,
    publish: publishConfig,
    ...macSigningConfig,
    target: [
      {
        target: 'dmg',
        arch: ['arm64'],
      },
      {
        target: 'zip',
        arch: ['arm64'],
      },
    ],
  },
  publish: publishConfig,
}
