#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const routerPath = 'docs/next/agent-workbench-task-slices.md'
const manifestPath = 'docs/next/agent-workbench-contract-migration.json'
const splitMarker = '<!-- nyx-contract-layout: split-v1 -->'
const migrationMode = process.argv.includes('--migration')

const workstreams = [
  'foundation',
  'current-thread-durability',
  'provider-compatibility-core',
  'composer-target-selection',
  'context-composer-experiment',
  'responses-protocol',
  'document-attachments',
  'multi-thread-library',
]

const splitFiles = [
  'docs/next/agent-workbench-foundation-task-slices.md',
  'docs/next/current-thread-durability-task-slices.md',
  'docs/next/provider-compatibility-core-task-slices.md',
  'docs/next/composer-target-selection-task-slices.md',
  'docs/next/context-composer-experiment-task-slices.md',
  'docs/next/responses-protocol-task-slices.md',
  'docs/next/document-attachments-task-slices.md',
  'docs/next/multi-thread-library-task-slices.md',
  'docs/next/multi-thread-library-e1r-contracts.md',
]

const legacyHeadings = [
  '## A0: Scope Gate Docs',
  '## B0: Current Thread Durability Scope Gate',
  '## C Workstream: Provider Compatibility Core',
  '## D Workstream: Composer Target Selection',
  '## E Workstream: Context Composer Experiment',
  '## R Workstream: Responses Protocol And Native Continuation',
  '## F Workstream: Document Attachments Local Baseline',
  '## MTL Workstream: Multi-Thread Library',
]

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function sourceLines(content) {
  const lines = []
  let start = 0
  while (start < content.length) {
    const newline = content.indexOf('\n', start)
    if (newline === -1) {
      lines.push(content.slice(start))
      break
    }
    lines.push(content.slice(start, newline + 1))
    start = newline + 1
  }
  return lines
}

function exactRange(lines, startLine, endLine) {
  return lines.slice(startLine - 1, endLine).join('')
}

function markdownFiles(directory) {
  const result = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      result.push(...markdownFiles(path))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      result.push(path)
    }
  }
  return result
}

function checkInstructionFile(relativePath, limits, requiredText, errors) {
  const content = read(relativePath)
  const lines = content.split('\n').length - 1
  const bytes = Buffer.byteLength(content)

  if (lines > limits.lines) {
    errors.push(`${relativePath}: ${lines} lines exceeds ${limits.lines}`)
  }
  if (bytes > limits.bytes) {
    errors.push(`${relativePath}: ${bytes} bytes exceeds ${limits.bytes}`)
  }

  const dynamicPatterns = [
    ['review contract id', /\bRC-[A-Z0-9-]+\b/],
    ['gate result history', /\bVALID_STOP\b/],
    ['dated history', /\b20\d{2}-\d{2}-\d{2}\b/],
    ['commit or exact-byte hash', /\b(?:[0-9a-f]{40}|[0-9a-f]{64})\b/],
    ['abbreviated commit hash', /`[0-9a-f]{7,39}`/],
  ]

  for (const [label, pattern] of dynamicPatterns) {
    if (pattern.test(content)) {
      errors.push(`${relativePath}: contains ${label}`)
    }
  }

  if (/^## Workstream Status$/m.test(content)) {
    errors.push(`${relativePath}: must not own dynamic workstream status`)
  }

  for (const text of requiredText) {
    if (!content.includes(text)) {
      errors.push(`${relativePath}: missing required guard: ${text}`)
    }
  }
}

function normalizedLinkTarget(rawTarget) {
  const target = rawTarget.trim()
  if (target.startsWith('<')) {
    const closing = target.indexOf('>')
    return closing === -1 ? target : target.slice(1, closing)
  }
  return target.split(/\s+["']/u, 1)[0]
}

function missingRouterTargets(router, paths) {
  return paths.filter((path) => !router.includes(`./${path.replace('docs/next/', '')}`))
}

function markdownLinkFailure(file, rawTarget, pathExists = existsSync) {
  const target = normalizedLinkTarget(rawTarget)
  if (target.startsWith('/')) {
    return `absolute documentation link ${target}`
  }
  if (target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/iu.test(target)) {
    return null
  }

  const pathPart = target.split(/[?#]/u, 1)[0]
  if (!pathPart) {
    return null
  }

  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathPart)
  } catch {
    return `invalid encoded link ${target}`
  }

  return pathExists(resolve(dirname(file), decodedPath)) ? null : `broken link ${target}`
}

function checkMarkdownLinks(files, errors) {
  const linkPattern = /!?\[[^\]]*\]\(([^)\n]+)\)/gu

  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    for (const match of content.matchAll(linkPattern)) {
      const failure = markdownLinkFailure(file, match[1])
      if (failure) {
        errors.push(`${relative(repoRoot, file)}: ${failure}`)
      }
    }
  }
}

function checkMachineLocalPaths(files, errors) {
  for (const file of files) {
    if (hasMachineLocalPath(readFileSync(file, 'utf8'))) {
      errors.push(`${relative(repoRoot, file)}: contains a machine-local path`)
    }
  }
}

function hasMachineLocalPath(content) {
  return /\/(?:Users|home)\/[A-Za-z0-9._-]+\//u.test(content)
}

function collectStatusOwners(files) {
  const owners = new Map()
  const pattern = /<!-- nyx-workstream-status-owner: ([a-z0-9-]+) -->/gu
  for (const [path, content] of files) {
    for (const match of content.matchAll(pattern)) {
      const locations = owners.get(match[1]) ?? []
      locations.push(path)
      owners.set(match[1], locations)
    }
  }
  return owners
}

function collectContractBlocks(files) {
  const blocks = new Map()
  const pattern =
    /<!-- nyx-contract-start: ([A-Za-z0-9._/-]+) sha256:([0-9a-f]{64}) -->\n([\s\S]*?)<!-- nyx-contract-end: \1 -->/gu

  for (const [path, content] of files) {
    for (const match of content.matchAll(pattern)) {
      const locations = blocks.get(match[1]) ?? []
      locations.push({
        path,
        declaredHash: match[2],
        body: match[3],
        bodyHash: sha256(match[3]),
      })
      blocks.set(match[1], locations)
    }
  }
  return blocks
}

function collectContractMarkers(files) {
  const starts = new Map()
  const ends = new Map()
  const startPattern = /<!-- nyx-contract-start: ([A-Za-z0-9._/-]+) sha256:([0-9a-f]{64}) -->/gu
  const endPattern = /<!-- nyx-contract-end: ([A-Za-z0-9._/-]+) -->/gu

  for (const [path, content] of files) {
    for (const match of content.matchAll(startPattern)) {
      const locations = starts.get(match[1]) ?? []
      locations.push(path)
      starts.set(match[1], locations)
    }
    for (const match of content.matchAll(endPattern)) {
      const locations = ends.get(match[1]) ?? []
      locations.push(path)
      ends.set(match[1], locations)
    }
  }

  return { starts, ends }
}

function validateSplitOwnership(files, manifest, errors) {
  const owners = collectStatusOwners(files)
  for (const workstream of workstreams) {
    const locations = owners.get(workstream) ?? []
    if (locations.length !== 1) {
      errors.push(`split layout: ${workstream} has ${locations.length} status owners`)
      continue
    }
    if (manifest.workstreamOwners?.[workstream] !== locations[0]) {
      errors.push(`split layout: ${workstream} owner does not match manifest`)
    }
  }
  for (const name of owners.keys()) {
    if (!workstreams.includes(name)) {
      errors.push(`split layout: unexpected workstream status owner ${name}`)
    }
  }

  if (
    manifest.workstreamOwners?.['multi-thread-library'] !==
    'docs/next/multi-thread-library-task-slices.md'
  ) {
    errors.push('split layout: Multi-Thread Library must have one main status owner')
  }

  const blocks = collectContractBlocks(files)
  const markers = collectContractMarkers(files)
  const expectedIds = new Set()
  for (const contract of manifest.contracts ?? []) {
    expectedIds.add(contract.id)
    const starts = markers.starts.get(contract.id) ?? []
    const ends = markers.ends.get(contract.id) ?? []
    if (starts.length !== 1 || ends.length !== 1) {
      errors.push(
        `split layout: ${contract.id} has ${starts.length} start and ${ends.length} end markers`,
      )
    }
    const locations = blocks.get(contract.id) ?? []
    if (locations.length !== 1) {
      errors.push(`split layout: ${contract.id} has ${locations.length} definitions`)
      continue
    }
    const [block] = locations
    if (block.path !== contract.file) {
      errors.push(`split layout: ${contract.id} is in the wrong file`)
    }
    if (block.declaredHash !== block.bodyHash) {
      errors.push(`split layout: ${contract.id} content hash mismatch`)
    }
  }
  const markerIds = new Set([...blocks.keys(), ...markers.starts.keys(), ...markers.ends.keys()])
  for (const id of markerIds) {
    if (!expectedIds.has(id)) {
      errors.push(`split layout: unlisted contract marker ${id}`)
    }
  }
}

function validateMigrationProvenance(manifest, errors) {
  let historicalSource
  try {
    historicalSource = execFileSync(
      'git',
      ['show', `${manifest.source.gitCommit}:${manifest.source.path}`],
      { cwd: repoRoot, encoding: 'utf8' },
    )
  } catch (error) {
    errors.push(`${manifestPath}: cannot read migration source commit: ${error.message}`)
    return
  }

  if (sha256(historicalSource) !== manifest.source.sha256) {
    errors.push(`${manifestPath}: migration source file hash mismatch`)
  }
  const historicalLines = sourceLines(historicalSource)
  if (historicalLines.length !== manifest.source.lineCount) {
    errors.push(`${manifestPath}: migration source line count mismatch`)
  }

  const ranges = [
    ...(manifest.dispositions ?? []).map((item) => ({
      startLine: item.startLine,
      endLine: item.endLine,
      id: `disposition:${item.action}`,
    })),
    ...(manifest.contracts ?? []).map((item) => ({
      startLine: item.source?.startLine,
      endLine: item.source?.endLine,
      id: item.id,
    })),
  ].sort((left, right) => left.startLine - right.startLine)

  let expectedLine = 1
  for (const range of ranges) {
    if (range.startLine !== expectedLine) {
      errors.push(
        `${manifestPath}: source coverage breaks before ${range.id}; expected line ${expectedLine}`,
      )
    }
    expectedLine = range.endLine + 1
  }
  if (expectedLine !== manifest.source.lineCount + 1) {
    errors.push(`${manifestPath}: source coverage ends at line ${expectedLine - 1}`)
  }

  for (const contract of manifest.contracts ?? []) {
    const startLine = contract.source?.startLine
    const endLine = contract.source?.endLine
    if (
      !Number.isInteger(startLine) ||
      !Number.isInteger(endLine) ||
      startLine < 1 ||
      endLine < startLine
    ) {
      errors.push(`${manifestPath}: ${contract.id} has an invalid source range`)
      continue
    }
    if (!/^[0-9a-f]{64}$/u.test(contract.sha256 ?? '')) {
      errors.push(`${manifestPath}: ${contract.id} has an invalid initial target hash`)
    }
    const sourceBody = exactRange(historicalLines, startLine, endLine)
    if (sha256(sourceBody) !== contract.source?.sha256) {
      errors.push(`${manifestPath}: ${contract.id} source hash mismatch`)
    }
  }
}

function checkLegacyLayout(router, errors) {
  for (const heading of legacyHeadings) {
    if (!router.includes(heading)) {
      errors.push(`${routerPath}: missing legacy workstream heading ${heading}`)
    }
  }

  for (const path of splitFiles) {
    if (existsSync(resolve(repoRoot, path))) {
      errors.push(`legacy layout: partial split file exists: ${path}`)
    }
  }
  if (existsSync(resolve(repoRoot, manifestPath))) {
    errors.push(`legacy layout: migration manifest exists before atomic split`)
  }
}

function validateManifestShape(manifest, errors) {
  if (manifest.version !== 2 || manifest.recordType !== 'migration_provenance_only') {
    errors.push(`${manifestPath}: unsupported manifest version`)
  }
  if (manifest.reversible !== false) {
    errors.push(`${manifestPath}: provenance record must remain non-reversible`)
  }
  if (!/^[0-9a-f]{64}$/u.test(manifest.source?.sha256 ?? '')) {
    errors.push(`${manifestPath}: invalid source SHA-256`)
  }
  if (!/^[0-9a-f]{40}$/u.test(manifest.source?.gitCommit ?? '')) {
    errors.push(`${manifestPath}: invalid source commit`)
  }
  if (manifest.prerequisite?.nf1 !== 'retired') {
    errors.push(`${manifestPath}: NF1 prerequisite must remain retired`)
  }
  if (!manifest.prerequisite?.evidenceRef) {
    errors.push(`${manifestPath}: NF1 terminal evidence reference is missing`)
  }
}

function checkSplitLayout(router, files, errors) {
  if (!existsSync(resolve(repoRoot, manifestPath))) {
    errors.push(`split layout: missing ${manifestPath}`)
    return
  }

  let manifest
  try {
    manifest = JSON.parse(read(manifestPath))
  } catch (error) {
    errors.push(`${manifestPath}: invalid JSON: ${error.message}`)
    return
  }

  validateManifestShape(manifest, errors)

  for (const path of splitFiles) {
    if (!files.has(path)) {
      errors.push(`split layout: missing ${path}`)
    }
  }
  for (const path of missingRouterTargets(router, splitFiles)) {
    errors.push(`${routerPath}: missing route to ${path}`)
  }

  validateSplitOwnership(files, manifest, errors)
  if (migrationMode) {
    validateMigrationProvenance(manifest, errors)
  }
}

function runSelfTests(errors) {
  const body = 'contract body\n'
  const hash = sha256(body)
  const mtlPath = 'docs/next/multi-thread-library-task-slices.md'
  const validFiles = new Map()
  const validManifest = {
    workstreamOwners: {},
    contracts: [
      {
        id: 'MTL/S0',
        file: mtlPath,
        sha256: hash,
      },
    ],
  }

  for (const workstream of workstreams) {
    const path =
      workstream === 'multi-thread-library' ? mtlPath : `docs/next/fixtures/${workstream}.md`
    const contract =
      workstream === 'multi-thread-library'
        ? `\n<!-- nyx-contract-start: MTL/S0 sha256:${hash} -->\n${body}<!-- nyx-contract-end: MTL/S0 -->`
        : ''
    validFiles.set(path, `<!-- nyx-workstream-status-owner: ${workstream} -->${contract}\n`)
    validManifest.workstreamOwners[workstream] = path
  }

  const expectValidation = (label, files, manifest, expectedError = null) => {
    const fixtureErrors = []
    validateSplitOwnership(files, manifest, fixtureErrors)
    if (expectedError === null && fixtureErrors.length > 0) {
      errors.push(`self-test: ${label} produced unexpected errors: ${fixtureErrors.join('; ')}`)
    } else if (
      expectedError !== null &&
      !fixtureErrors.some((error) => error.includes(expectedError))
    ) {
      errors.push(`self-test: ${label} did not report ${expectedError}`)
    }
  }

  const validWithHistory = new Map(validFiles)
  validWithHistory.set(
    'docs/next/archive/history.md',
    'Historical mention of MTL/S0 is evidence, not a canonical definition.\n',
  )
  expectValidation('valid full fixture', validWithHistory, validManifest)

  const duplicateOwnerFiles = new Map(validFiles)
  duplicateOwnerFiles.set(
    'docs/next/archive/duplicate-owner.md',
    '<!-- nyx-workstream-status-owner: multi-thread-library -->',
  )
  expectValidation(
    'nested duplicate owner',
    duplicateOwnerFiles,
    validManifest,
    'multi-thread-library has 2 status owners',
  )

  const startOnlyFiles = new Map(validFiles)
  const startOnlyPath = 'docs/next/archive/start-only.md'
  startOnlyFiles.set(
    startOnlyPath,
    `<!-- nyx-contract-start: MTL/START-ONLY sha256:${hash} -->\n${body}`,
  )
  const startOnlyManifest = structuredClone(validManifest)
  startOnlyManifest.contracts.push({
    id: 'MTL/START-ONLY',
    file: startOnlyPath,
    sha256: hash,
  })
  expectValidation(
    'start-only marker',
    startOnlyFiles,
    startOnlyManifest,
    'MTL/START-ONLY has 1 start and 0 end markers',
  )

  const endOnlyFiles = new Map(validFiles)
  const endOnlyPath = 'docs/next/archive/end-only.md'
  endOnlyFiles.set(endOnlyPath, '<!-- nyx-contract-end: MTL/END-ONLY -->')
  const endOnlyManifest = structuredClone(validManifest)
  endOnlyManifest.contracts.push({
    id: 'MTL/END-ONLY',
    file: endOnlyPath,
    sha256: hash,
  })
  expectValidation(
    'end-only marker',
    endOnlyFiles,
    endOnlyManifest,
    'MTL/END-ONLY has 0 start and 1 end markers',
  )

  const duplicateContractFiles = new Map(validFiles)
  duplicateContractFiles.set(
    'docs/next/archive/duplicate-contract.md',
    `<!-- nyx-contract-start: MTL/S0 sha256:${hash} -->\n${body}<!-- nyx-contract-end: MTL/S0 -->`,
  )
  expectValidation(
    'duplicate contract',
    duplicateContractFiles,
    validManifest,
    'MTL/S0 has 2 definitions',
  )

  const unknownContractFiles = new Map(validFiles)
  unknownContractFiles.set(
    'docs/next/archive/unknown-contract.md',
    `<!-- nyx-contract-start: MTL/UNKNOWN sha256:${hash} -->\n${body}<!-- nyx-contract-end: MTL/UNKNOWN -->`,
  )
  expectValidation(
    'unknown contract',
    unknownContractFiles,
    validManifest,
    'unlisted contract marker MTL/UNKNOWN',
  )

  const wrongHashFiles = new Map(validFiles)
  wrongHashFiles.set(
    mtlPath,
    wrongHashFiles.get(mtlPath).replace(`sha256:${hash}`, `sha256:${'0'.repeat(64)}`),
  )
  expectValidation(
    'body hash mismatch',
    wrongHashFiles,
    validManifest,
    'MTL/S0 content hash mismatch',
  )

  const missingContractManifest = structuredClone(validManifest)
  missingContractManifest.contracts.push({
    id: 'MTL/MISSING',
    file: mtlPath,
    sha256: hash,
  })
  expectValidation(
    'missing contract',
    validFiles,
    missingContractManifest,
    'MTL/MISSING has 0 definitions',
  )

  for (const nf1 of ['reviewed_pass', 'valid_stop']) {
    const nonRetiredManifestErrors = []
    validateManifestShape(
      {
        version: 2,
        recordType: 'migration_provenance_only',
        reversible: false,
        source: {
          sha256: 'a'.repeat(64),
          gitCommit: 'b'.repeat(40),
        },
        prerequisite: {
          nf1,
          evidenceRef: `${mtlPath}#current-status`,
        },
      },
      nonRetiredManifestErrors,
    )
    if (!nonRetiredManifestErrors.some((error) => error.includes('must remain retired')))
      errors.push(`self-test: NF1 prerequisite ${nf1} was not rejected`)
  }

  const reversibleManifestErrors = []
  validateManifestShape(
    {
      version: 2,
      recordType: 'migration_provenance_only',
      reversible: true,
      source: {
        sha256: 'a'.repeat(64),
        gitCommit: 'b'.repeat(40),
      },
      prerequisite: {
        nf1: 'retired',
        evidenceRef: `${mtlPath}#current-status`,
      },
    },
    reversibleManifestErrors,
  )
  if (!reversibleManifestErrors.some((error) => error.includes('non-reversible')))
    errors.push('self-test: reversible provenance record was not rejected')

  if (!hasMachineLocalPath('/Users/example/project/file.md')) {
    errors.push('self-test: machine-local path was not detected')
  }
  const fixtureDocument = resolve(repoRoot, 'docs/next/fixture.md')
  if (!markdownLinkFailure(fixtureDocument, './missing.md', () => false)) {
    errors.push('self-test: broken relative link was not detected')
  }
  if (markdownLinkFailure(fixtureDocument, './present.md', () => true)) {
    errors.push('self-test: valid relative link was rejected')
  }
  if (missingRouterTargets('route to ./one.md', ['docs/next/one.md']).length !== 0) {
    errors.push('self-test: valid router target was not detected')
  }
  if (missingRouterTargets('route to ./one.md', ['docs/next/two.md']).length !== 1) {
    errors.push('self-test: missing router target was not detected')
  }
}

const errors = []
runSelfTests(errors)

checkInstructionFile(
  'AGENTS.md',
  { lines: 240, bytes: 12_000 },
  [
    'Reading a workstream contract to protect landed behavior does not authorize new',
    routerPath,
    'Already-landed workstream behavior is part of the compatibility baseline',
  ],
  errors,
)
checkInstructionFile(
  'apps/desktop/AGENTS.md',
  { lines: 220, bytes: 11_000 },
  [
    'compatibility protection is not new implementation',
    '../../docs/next/agent-workbench-task-slices.md',
    'Implemented Behavior Guards',
  ],
  errors,
)

const router = read(routerPath)
const docsNext = markdownFiles(resolve(repoRoot, 'docs/next'))
const docsNextFiles = new Map(
  docsNext.map((file) => [relative(repoRoot, file), readFileSync(file, 'utf8')]),
)
if (router.includes(splitMarker)) {
  checkSplitLayout(router, docsNextFiles, errors)
} else {
  checkLegacyLayout(router, errors)
}

const docs = [
  resolve(repoRoot, 'AGENTS.md'),
  resolve(repoRoot, 'README.md'),
  resolve(repoRoot, 'docs/v1-min-chat-implementation-plan.md'),
  resolve(repoRoot, 'apps/desktop/AGENTS.md'),
  ...markdownFiles(resolve(repoRoot, 'docs/agent')),
  ...docsNext,
]
checkMarkdownLinks(docs, errors)
checkMachineLocalPaths(docs, errors)

if (errors.length > 0) {
  console.error('Agent documentation check failed:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
} else {
  console.log(
    migrationMode
      ? 'Agent documentation and migration provenance checks passed.'
      : 'Agent documentation check passed.',
  )
}
