export function codePointOffset(text: string, offset: number): number | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return null
  const previous = text.charCodeAt(offset - 1), next = text.charCodeAt(offset)
  if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) return null
  return Array.from(text.slice(0, offset)).length
}
