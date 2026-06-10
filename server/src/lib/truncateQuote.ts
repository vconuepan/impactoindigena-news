// Enforces the "citas breves" promise from the site's Terms (derecho de cita,
// Art. 71 Ley 17.336): quotes stored and displayed never exceed
// MAX_QUOTE_CHARS. The assess prompt instructs the model to keep quotes
// short; this function is the guarantee. Truncation drops trailing whole
// sentences — a verbatim quote is never cut mid-sentence. Only when the first
// sentence alone exceeds the limit do we hard-cut with an ellipsis.

export const MAX_QUOTE_CHARS = 300

export function truncateQuote(
  quote: string | null | undefined,
  max = MAX_QUOTE_CHARS,
): string | null {
  if (!quote) return null
  const trimmed = quote.trim()
  if (!trimmed) return null
  if (trimmed.length <= max) return trimmed

  const sentences = trimmed.split(/(?<=[.!?…])\s+/)
  let out = ''
  for (const sentence of sentences) {
    const candidate = out ? `${out} ${sentence}` : sentence
    if (candidate.length > max) break
    out = candidate
  }
  if (out) return out

  return trimmed.slice(0, max - 1).trimEnd() + '…'
}
