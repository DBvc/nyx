import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname } from 'node:path'

export interface CurrentThreadFileAdapter {
  readText(filePath: string): Promise<string>
  ensureParentDirectory(filePath: string): Promise<void>
  createTempPath(filePath: string): string
  writeText(filePath: string, contents: string, mode: number): Promise<void>
  writeBytes(filePath: string, contents: Uint8Array, mode: number): Promise<void>
  rename(sourcePath: string, destinationPath: string): Promise<void>
  remove(filePath: string): Promise<void>
  ensureDirectory(directoryPath: string, mode: number): Promise<void>
  listDirectory(directoryPath: string): Promise<string[]>
  lstat(filePath: string): ReturnType<typeof lstat>
  readBytes(filePath: string, maximumBytes: number): Promise<Uint8Array>
  readPrefix(
    filePath: string,
    maximumFileBytes: number,
    maximumReadBytes: number,
  ): Promise<Uint8Array>
  removeDirectory(directoryPath: string): Promise<void>
}

async function readFilePart(
  filePath: string,
  maximumFileBytes: number,
  maximumReadBytes: number,
  complete: boolean,
) {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW)

  try {
    const fileStat = await handle.stat()

    if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > maximumFileBytes) {
      throw new Error('File is not a bounded regular file.')
    }

    const byteLength = complete ? fileStat.size : Math.min(fileStat.size, maximumReadBytes)
    const bytes = new Uint8Array(byteLength)
    let offset = 0

    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)

      if (bytesRead === 0) {
        throw new Error('File changed while it was being read.')
      }

      offset += bytesRead
    }

    if (complete) {
      const extraByte = new Uint8Array(1)
      const { bytesRead } = await handle.read(extraByte, 0, 1, offset)

      if (bytesRead !== 0) {
        throw new Error('File grew while it was being read.')
      }
    }

    const finalStat = await handle.stat()

    if (finalStat.size !== fileStat.size) {
      throw new Error('File changed while it was being read.')
    }

    return bytes
  } finally {
    await handle.close()
  }
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
    writeBytes: async (filePath, contents, mode) => {
      await writeFile(filePath, contents, { mode })
    },
    rename,
    remove: async (filePath) => {
      await rm(filePath)
    },
    ensureDirectory: async (directoryPath, mode) => {
      await mkdir(directoryPath, { recursive: true, mode })
      const directoryStat = await lstat(directoryPath)

      if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
        throw new Error('Attachment storage is not a regular directory.')
      }

      await chmod(directoryPath, mode)
    },
    listDirectory: (directoryPath) => readdir(directoryPath),
    lstat,
    readBytes: (filePath, maximumBytes) => readFilePart(filePath, maximumBytes, maximumBytes, true),
    readPrefix: (filePath, maximumFileBytes, maximumReadBytes) =>
      readFilePart(filePath, maximumFileBytes, maximumReadBytes, false),
    removeDirectory: async (directoryPath) => {
      await rm(directoryPath, { recursive: true, force: true })
    },
  }
}
