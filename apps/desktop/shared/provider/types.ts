export type NyxProviderMissingEnv = 'NYX_API_BASE_URL' | 'NYX_API_TOKEN'

export interface NyxProviderStatus {
  configured: boolean
  model: string | null
  baseUrlHost: string | null
  missingEnv: ReadonlyArray<NyxProviderMissingEnv>
}
