export const nyxThreadTitleMaxCodePoints = 48

export type NyxThreadTitleValidation = { ok: true; title: string } | { ok: false; message: string }

export function validateNyxThreadTitle(value: string): NyxThreadTitleValidation {
  const title = value.trim()
  const length = Array.from(title).length
  if (length === 0) {
    return { ok: false, message: 'Enter a title.' }
  }
  if (length > nyxThreadTitleMaxCodePoints) {
    return {
      ok: false,
      message: `Use ${nyxThreadTitleMaxCodePoints} characters or fewer.`,
    }
  }
  return { ok: true, title }
}
