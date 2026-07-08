import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

export type ConfigFileErrorCode = 'io_error' | 'malformed_json' | 'schema_invalid'

export class ConfigFileError extends Error {
  readonly code: ConfigFileErrorCode

  constructor(code: ConfigFileErrorCode, message: string) {
    super(message)
    this.name = 'ConfigFileError'
    this.code = code
  }
}

export interface JsonConfigFile<TValue> {
  readonly filePath: string
  read(): Promise<TValue | null>
  write(value: TValue): Promise<void>
}

export interface JsonConfigFileOptions<TValue> {
  filePath: string
  parse(value: unknown): TValue
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

export function createConnectionsSettingsPaths(userDataPath: string) {
  const settingsDir = join(userDataPath, 'settings')

  return {
    connectionsFilePath: join(settingsDir, 'connections.json'),
    secretsFilePath: join(settingsDir, 'secrets.json'),
  }
}

export function createJsonConfigFile<TValue>({
  filePath,
  parse,
}: JsonConfigFileOptions<TValue>): JsonConfigFile<TValue> {
  return {
    filePath,

    async read() {
      let raw: string

      try {
        raw = await readFile(filePath, 'utf8')
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          return null
        }

        throw new ConfigFileError('io_error', 'Could not read settings file.')
      }

      let value: unknown

      try {
        value = JSON.parse(raw)
      } catch {
        throw new ConfigFileError('malformed_json', 'Settings file is not valid JSON.')
      }

      try {
        return parse(value)
      } catch {
        throw new ConfigFileError('schema_invalid', 'Settings file shape is invalid.')
      }
    },

    async write(value) {
      const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`

      try {
        await mkdir(dirname(filePath), { recursive: true })
        await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
          encoding: 'utf8',
          mode: 0o600,
        })
        await rename(tempPath, filePath)
      } catch {
        throw new ConfigFileError('io_error', 'Could not write settings file.')
      }
    },
  }
}
