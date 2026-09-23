const DELIVERY_SUFFIX_PATTERNS = [
  /\s*【\s*(?:只发|仅发|限发|禁发)[^】]*\s*】\s*$/,
  /\s*（\s*(?:只发|仅发|限发|禁发)[^）]*\s*）\s*$/,
  /\s*\(\s*(?:只发|仅发|限发|禁发)[^)]*\s*\)\s*$/,
  /\s*(?:只发|仅发|限发|禁发)\S+\s*$/,
]

export function planDisplayName(name: string) {
  const originalName = name.trim()
  const displayName = DELIVERY_SUFFIX_PATTERNS.reduce(
    (displayName, pattern) => displayName.replace(pattern, '').trim(),
    originalName,
  )

  return displayName || originalName
}
