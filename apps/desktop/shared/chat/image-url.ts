export const nyxChatImageScheme = 'nyx-image'

export const nyxChatImageVariants = ['preview', 'full'] as const

export type NyxChatImageVariant = (typeof nyxChatImageVariants)[number]

export function buildNyxChatImageUrl(imageId: string, variant: NyxChatImageVariant) {
  return `${nyxChatImageScheme}://${variant}/${imageId}`
}
