import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface CurrentThreadFileAdapter {
  readText(filePath: string): Promise<string>
  ensureParentDirectory(filePath: string): Promise<void>
  createTempPath(filePath: string): string
  writeText(filePath: string, contents: string, mode: number): Promise<void>
  rename(sourcePath: string, destinationPath: string): Promise<void>
  remove(filePath: string): Promise<void>
}

export function createCurrentThreadFileAdapter(): CurrentThreadFileAdapter {
  return {
    readText: (filePath) => readFile(filePath, 'utf8'),
    ensureParentDirectory: async (filePath) => {
      await mkdir(dirname(filePath), { recursive: true })
    },
    createTempPath: (filePath) => `${filePath}.${process.pid}.${randomUUID()}.tmp`,
    writeText: async (filePath, contents, mode) => {
      await writeFile(filePath, contents, { encoding: 'utf8', mode })
    },
    rename,
    remove: async (filePath) => {
      await rm(filePath)
    },
  }
}
