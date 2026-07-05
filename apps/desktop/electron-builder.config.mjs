function readPackageFlavor() {
  const flavor = process.env.NYX_PACKAGE_FLAVOR ?? 'dev'

  if (flavor === 'dev' || flavor === 'prod') {
    return flavor
  }

  throw new Error(`Unsupported NYX_PACKAGE_FLAVOR: ${flavor}`)
}

const packageFlavor = readPackageFlavor()
const identities = {
  dev: {
    appId: 'dev.dbvc.nyx',
    productName: 'Nyx Dev',
    artifactPrefix: 'nyx-dev',
  },
  prod: {
    appId: 'com.dbvc.nyx',
    productName: 'Nyx',
    artifactPrefix: 'nyx',
  },
}
const identity = identities[packageFlavor]
const artifactName = `${identity.artifactPrefix}-\${version}-mac-arm64.\${ext}`

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
    identity: null,
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
  publish: null,
}
